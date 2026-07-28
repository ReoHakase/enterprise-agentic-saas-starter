import type { Db } from "@enterprise-agentic-saas/db"

import type {
  AgentCreateIssueActionInput,
  AgentDeleteIssueActionInput,
  AgentIssueAction,
  AgentUpdateIssueActionInput,
} from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import { bindReusableAgentAssetsToRunInTransaction } from "../../files/public"
import { type AgentTransaction } from "../threads/repository"
import {
  buildPreparedIssueAction,
  type PreparedIssueActionInput,
} from "./prepare-action-builders"
import {
  expireActionsInTransaction,
  findExistingPreparedAction,
  reserveRootWrite,
} from "./prepare-read-support"
import {
  persistPreparedAction,
  validatePrepareGrant,
} from "./prepare-write-support"
import {
  actionRequestFingerprint,
  isActiveAssetLeaseConflict,
  isPrepareRetryableRace,
  preserveAgentActionError,
  toActionDto,
  withAgentPrepareLock,
  type PrepareInput,
} from "./repository-support"

const prepareInTransaction = async (
  tx: AgentTransaction,
  input: PreparedIssueActionInput
) => {
  const now = input.now ?? new Date()
  const requestFingerprint = await actionRequestFingerprint({
    issue: input.issue,
    kind: input.kind,
  })
  const context = await validatePrepareGrant(tx, input.grant, now)
  await expireActionsInTransaction(tx, {
    organizationId: context.organizationId,
    now,
  })
  const existing = await findExistingPreparedAction(tx, {
    context,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    requestFingerprint,
    toolCallId: input.toolCallId,
  })
  if (existing) return existing
  if (context.runStatus !== "running") {
    throw publicErrors.conflict("Agent run cannot prepare another action", {
      reason: "invalid_run_scope",
      resource: "agent_run",
    })
  }

  const attachmentAssetIds =
    input.kind === "create_issue"
      ? (input.issue.attachmentAssetIds ?? [])
      : input.kind === "update_issue" &&
          input.issue.operation === "add_attachments"
        ? input.issue.attachmentAssetIds
        : []
  await bindReusableAgentAssetsToRunInTransaction(tx, {
    assetIds: attachmentAssetIds,
    context,
    now,
  })

  const prepared = await buildPreparedIssueAction(
    tx,
    input,
    context,
    now,
    requestFingerprint
  )

  await reserveRootWrite(tx, context)
  return persistPreparedAction(tx, {
    context,
    kind: input.kind,
    ...prepared,
    idempotencyKey: input.idempotencyKey,
    toolCallId: input.toolCallId,
    now,
  })
}

export const prepareCreateIssueAction = async (
  db: Db,
  input: PrepareInput & { issue: AgentCreateIssueActionInput }
): Promise<AgentIssueAction> =>
  withAgentPrepareLock(input.grant, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- cross-isolate race時だけ同じ冪等requestをbounded retryで再検証する。
        const action = await db.transaction((tx) =>
          prepareInTransaction(tx, { ...input, kind: "create_issue" })
        )
        return toActionDto(action)
      } catch (cause) {
        if (isActiveAssetLeaseConflict(cause)) {
          throw publicErrors.conflict(
            "Agent attachment is already reserved by another action",
            {
              reason: "asset_lease_conflict",
              resource: "agent_asset",
            }
          )
        }
        if (attempt < 4 && isPrepareRetryableRace(cause)) {
          // oxlint-disable-next-line no-await-in-loop -- committed canonical actionをbounded retryで再読込する。
          await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
          continue
        }
        return preserveAgentActionError(cause, "prepareCreateIssueAction")
      }
    }
    throw new Error("Agent create action retry exhausted")
  })

export const prepareUpdateIssueAction = async (
  db: Db,
  input: PrepareInput & { issue: AgentUpdateIssueActionInput }
): Promise<AgentIssueAction> =>
  withAgentPrepareLock(input.grant, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- cross-isolate race時だけ同じ冪等requestをbounded retryで再検証する。
        const action = await db.transaction((tx) =>
          prepareInTransaction(tx, { ...input, kind: "update_issue" })
        )
        return toActionDto(action)
      } catch (cause) {
        if (attempt < 4 && isPrepareRetryableRace(cause)) {
          // oxlint-disable-next-line no-await-in-loop -- committed canonical actionをbounded retryで再読込する。
          await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
          continue
        }
        return preserveAgentActionError(cause, "prepareUpdateIssueAction")
      }
    }
    throw new Error("Agent update action retry exhausted")
  })

export const prepareDeleteIssueAction = async (
  db: Db,
  input: PrepareInput & { issue: AgentDeleteIssueActionInput }
): Promise<AgentIssueAction> =>
  withAgentPrepareLock(input.grant, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- cross-isolate race時だけ同じ冪等requestをbounded retryで再検証する。
        const action = await db.transaction((tx) =>
          prepareInTransaction(tx, { ...input, kind: "delete_issue" })
        )
        return toActionDto(action)
      } catch (cause) {
        if (attempt < 4 && isPrepareRetryableRace(cause)) {
          // oxlint-disable-next-line no-await-in-loop -- committed canonical actionをbounded retryで再読込する。
          await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
          continue
        }
        return preserveAgentActionError(cause, "prepareDeleteIssueAction")
      }
    }
    throw new Error("Agent delete action retry exhausted")
  })
