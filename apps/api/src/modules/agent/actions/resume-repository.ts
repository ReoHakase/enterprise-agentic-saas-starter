import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentActions,
  agentResumeTickets,
  agentRuns,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, inArray, isNull } from "drizzle-orm"

import type { AgentRunGrant } from "../../../agent-client"
import { HttpError } from "../../../errors/http-error"
import { ensureAgentSessionContextInTransaction } from "../context/repository"
import { createAgentToken, hashAgentToken } from "../crypto"
import {
  createGrantInTransaction,
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
} from "../threads/repository"
import { ACTION_RESUME_RUN_TTL_MS } from "./repository-support"

export const resumeAgentApprovedAction = async (
  db: Db,
  input: { actionId: string; resumeTicket: string; now?: Date }
): Promise<AgentRunGrant> => {
  const [ticketHash, runCredential] = await Promise.all([
    hashAgentToken(input.resumeTicket),
    createAgentToken(),
  ])
  return await db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const tickets = await tx
      .update(agentResumeTickets)
      .set({ consumedAt: now })
      .where(
        and(
          eq(agentResumeTickets.tokenHash, ticketHash),
          eq(agentResumeTickets.actionId, input.actionId),
          isNull(agentResumeTickets.consumedAt),
          isNull(agentResumeTickets.revokedAt),
          gt(agentResumeTickets.expiresAt, now)
        )
      )
      .returning()
    const ticket = tickets[0]
    if (!ticket) {
      throw new HttpError({ code: "unauthorized" })
    }
    const live = await requireLiveSession(tx, {
      sessionId: ticket.sessionId,
      userId: ticket.userId,
      now,
    })
    if (live.activeOrganizationId !== ticket.organizationId) {
      throw new HttpError({ code: "active_organization_mismatch" })
    }
    await requireActiveMembership(tx, live)
    await requireOwnedThread(tx, {
      threadId: ticket.threadId,
      userId: ticket.userId,
      activeOrganizationId: ticket.organizationId,
    })
    const context = await ensureAgentSessionContextInTransaction(tx, {
      sessionId: ticket.sessionId,
      userId: ticket.userId,
      now,
    })
    if (context.contextEpoch !== ticket.contextEpoch) {
      throw new HttpError({ code: "unauthorized" })
    }
    const actionRows = await tx
      .select()
      .from(agentActions)
      .where(
        and(
          eq(agentActions.organizationId, ticket.organizationId),
          eq(agentActions.id, ticket.actionId),
          eq(agentActions.threadId, ticket.threadId),
          eq(agentActions.sessionId, ticket.sessionId),
          eq(agentActions.userId, ticket.userId),
          eq(agentActions.contextEpoch, ticket.contextEpoch)
        )
      )
      .limit(1)
    const action = actionRows[0]
    if (
      !action ||
      action.status !== "approved" ||
      action.decisionProvenance !== "manual" ||
      action.expiresAt.getTime() <= now.getTime()
    ) {
      throw new HttpError({ code: "conflict" })
    }
    const activeContinuation = await tx
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.organizationId, action.organizationId),
          eq(agentRuns.resumedActionId, action.id),
          inArray(agentRuns.status, ["running", "waiting_approval"]),
          gt(agentRuns.expiresAt, now)
        )
      )
      .limit(1)
    if (activeContinuation[0]) {
      throw new HttpError({ code: "conflict" })
    }
    const originRows = await tx
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.organizationId, action.organizationId),
          eq(agentRuns.id, action.runId),
          eq(agentRuns.threadId, action.threadId),
          eq(agentRuns.sessionId, action.sessionId),
          eq(agentRuns.userId, action.userId),
          eq(agentRuns.contextEpoch, action.contextEpoch)
        )
      )
      .limit(1)
    const origin = originRows[0]
    if (!origin) throw new Error("Agent action origin run is missing")

    const runId = crypto.randomUUID()
    const expiresAt = new Date(
      Math.min(
        now.getTime() + ACTION_RESUME_RUN_TTL_MS,
        action.expiresAt.getTime()
      )
    )
    await tx.insert(agentRuns).values({
      id: runId,
      organizationId: action.organizationId,
      threadId: action.threadId,
      rootRunId: origin.rootRunId,
      parentRunId: origin.id,
      resumedActionId: action.id,
      sessionId: action.sessionId,
      userId: action.userId,
      contextEpoch: action.contextEpoch,
      status: "running",
      scope: "action_resume",
      startedAt: now,
      expiresAt,
    })
    await tx
      .update(agentRuns)
      .set({ status: "completed", finishedAt: now })
      .where(
        and(
          eq(agentRuns.organizationId, origin.organizationId),
          eq(agentRuns.id, origin.id),
          eq(agentRuns.status, "waiting_approval")
        )
      )
    const grantExpiresAt = await createGrantInTransaction(tx, {
      tokenHash: runCredential.tokenHash,
      kind: "run",
      organizationId: action.organizationId,
      threadId: action.threadId,
      runId,
      sessionId: action.sessionId,
      userId: action.userId,
      contextEpoch: action.contextEpoch,
      now,
      expiresAt,
    })
    return {
      runId,
      rootRunId: origin.rootRunId,
      attempt: 1,
      grant: runCredential.token,
      expiresAt: grantExpiresAt.toISOString(),
      shouldGenerateTitle: false,
    }
  })
}
