import type { Db } from "@enterprise-agentic-saas/db"
import { agentActions, agentGrants } from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, isNull, lte } from "drizzle-orm"

import type { AgentActionExecutionResult } from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import { hashAgentToken } from "../crypto"
import { executeAgentApprovedActionInTransaction } from "./execution-transaction"
import { expireActionsInTransaction } from "./prepare-read-support"
import {
  ACTION_TERMINAL_RETENTION_MS,
  isActionWriteRetryableRace,
  preserveAgentActionError,
  withAgentActionLock,
} from "./repository-support"

const executeAgentApprovedActionWithRetry = async (
  db: Db,
  input: { grant: string; actionId: string; now?: Date },
  attempt = 0
): Promise<AgentActionExecutionResult> => {
  try {
    const outcome = await db.transaction((tx) =>
      executeAgentApprovedActionInTransaction(tx, input)
    )
    if (outcome.conflict) {
      throw publicErrors.conflict("Agent action must be prepared again", {
        reason: outcome.conflict,
        resource: "agent_action",
      })
    }
    if (!outcome.result) throw new Error("Agent action returned no result")
    return outcome.result
  } catch (cause) {
    if (attempt < 4 && isActionWriteRetryableRace(cause)) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
      return executeAgentApprovedActionWithRetry(db, input, attempt + 1)
    }
    return preserveAgentActionError(cause, "executeAgentApprovedAction")
  }
}

const readAgentExecutionOrganizationForLock = async (
  db: Db,
  input: { grant: string; actionId: string; now?: Date },
  attempt = 0
): Promise<string | null> => {
  try {
    const rows = await db
      .select({ organizationId: agentGrants.organizationId })
      .from(agentGrants)
      .where(
        and(
          eq(agentGrants.tokenHash, await hashAgentToken(input.grant)),
          eq(agentGrants.kind, "run")
        )
      )
      .limit(1)
    return rows[0]?.organizationId ?? null
  } catch (cause) {
    if (attempt < 4 && isActionWriteRetryableRace(cause)) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
      return readAgentExecutionOrganizationForLock(db, input, attempt + 1)
    }
    return preserveAgentActionError(
      cause,
      "readAgentExecutionOrganizationForLock"
    )
  }
}

export const executeAgentApprovedAction = async (
  db: Db,
  input: { grant: string; actionId: string; now?: Date }
): Promise<AgentActionExecutionResult> =>
  withAgentActionLock(`action:${input.actionId}`, async () => {
    const organizationId = await readAgentExecutionOrganizationForLock(
      db,
      input
    )

    const execute = () => executeAgentApprovedActionWithRetry(db, input)

    return organizationId
      ? withAgentActionLock(`issue-write:${organizationId}`, execute)
      : execute()
  })

export const sweepAgentActions = async (
  db: Db,
  now = new Date()
): Promise<{ expired: number; scrubbed: number }> => {
  try {
    return await db.transaction(async (tx) => {
      const dueOrganizations = await tx
        .select({ organizationId: agentActions.organizationId })
        .from(agentActions)
        .where(
          and(
            inArray(agentActions.status, ["pending", "approved"]),
            lte(agentActions.expiresAt, now)
          )
        )
        .groupBy(agentActions.organizationId)
      let expired = 0
      for (const { organizationId } of dueOrganizations) {
        // oxlint-disable-next-line no-await-in-loop -- maintenanceでもtenantごとのupdate fenceを維持する。
        expired += await expireActionsInTransaction(tx, {
          organizationId,
          now,
        })
      }
      const scrubbedRows = await tx
        .update(agentActions)
        .set({
          normalizedPayload: null,
          canonicalPreview: null,
          scrubbedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            inArray(agentActions.status, [
              "rejected",
              "expired",
              "canceled",
              "succeeded",
              "conflicted",
            ]),
            isNull(agentActions.scrubbedAt),
            lte(
              agentActions.completedAt,
              new Date(now.getTime() - ACTION_TERMINAL_RETENTION_MS)
            )
          )
        )
        .returning({ id: agentActions.id })
      return { expired, scrubbed: scrubbedRows.length }
    })
  } catch (cause) {
    return preserveAgentActionError(cause, "sweepAgentActions")
  }
}
