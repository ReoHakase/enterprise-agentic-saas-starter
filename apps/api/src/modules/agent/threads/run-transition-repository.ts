import type { AgentRunResult } from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentActions,
  agentGrants,
  agentResumeTickets,
  agentRuns,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, isNull } from "drizzle-orm"

import { HttpError } from "../../../errors/http-error"
import { hashAgentToken } from "../crypto"
import {
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
  validateGrantInTransaction,
} from "./auth-repository"
import type { AgentTransaction } from "./repository-support"

const cancelRunActionsInTransaction = async (
  tx: AgentTransaction,
  input: { organizationId: string; runId: string; now: Date }
) => {
  const unresolved = await tx
    .select({ id: agentActions.id })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.organizationId, input.organizationId),
        eq(agentActions.runId, input.runId),
        inArray(agentActions.status, ["pending", "approved"])
      )
    )
  const actionIds = unresolved.map(({ id }) => id)
  if (actionIds.length === 0) return
  await tx
    .update(agentResumeTickets)
    .set({ revokedAt: input.now })
    .where(
      and(
        eq(agentResumeTickets.organizationId, input.organizationId),
        inArray(agentResumeTickets.actionId, actionIds),
        isNull(agentResumeTickets.consumedAt),
        isNull(agentResumeTickets.revokedAt)
      )
    )
  await tx
    .update(agentActions)
    .set({ status: "canceled", completedAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(agentActions.organizationId, input.organizationId),
        inArray(agentActions.id, actionIds),
        inArray(agentActions.status, ["pending", "approved"])
      )
    )
}

const transitionAgentRun = async (
  db: Db,
  input: {
    grant: string
    status: "completed" | "failed" | "canceled"
    now?: Date
  }
): Promise<AgentRunResult> => {
  const tokenHash = await hashAgentToken(input.grant)
  return await db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const context = await validateGrantInTransaction(tx, {
      tokenHash,
      kind: "run",
      now,
      allowTerminalRun: true,
      allowRevokedTerminalRun: true,
    })
    if (!context.runId || !context.runStatus) {
      throw new HttpError({ code: "unauthorized" })
    }
    if (context.runStatus === input.status) {
      if (input.status === "canceled") {
        await cancelRunActionsInTransaction(tx, {
          organizationId: context.organizationId,
          runId: context.runId,
          now,
        })
      }
      return { runId: context.runId, status: context.runStatus }
    }
    if (
      context.runStatus !== "running" &&
      context.runStatus !== "waiting_approval"
    ) {
      throw new HttpError({ code: "conflict" })
    }
    const rows = await tx
      .update(agentRuns)
      .set({ status: input.status, finishedAt: now })
      .where(
        and(
          eq(agentRuns.id, context.runId),
          eq(agentRuns.organizationId, context.organizationId),
          inArray(agentRuns.status, ["running", "waiting_approval"])
        )
      )
      .returning({ id: agentRuns.id, status: agentRuns.status })
    const run = rows[0]
    if (!run) {
      throw new HttpError({ code: "conflict" })
    }
    if (input.status === "canceled") {
      await cancelRunActionsInTransaction(tx, {
        organizationId: context.organizationId,
        runId: context.runId,
        now,
      })
    }
    await tx
      .update(agentGrants)
      .set({ revokedAt: now })
      .where(
        and(
          eq(agentGrants.organizationId, context.organizationId),
          eq(agentGrants.runId, context.runId),
          isNull(agentGrants.revokedAt)
        )
      )
    return { runId: run.id, status: run.status }
  })
}

export const cancelAgentRun = (db: Db, input: { grant: string; now?: Date }) =>
  transitionAgentRun(db, { ...input, status: "canceled" })

export const cancelAgentRunForSession = async (
  db: Db,
  input: {
    runId: string
    sessionId: string
    threadId: string
    userId: string
    now?: Date
  }
): Promise<AgentRunResult> =>
  await db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const current = await requireLiveSession(tx, { ...input, now })
    await requireActiveMembership(tx, current)
    const thread = await requireOwnedThread(tx, {
      activeOrganizationId: current.activeOrganizationId,
      requireActive: false,
      threadId: input.threadId,
      userId: input.userId,
    })
    const rows = await tx
      .select({ id: agentRuns.id, status: agentRuns.status })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.id, input.runId),
          eq(agentRuns.organizationId, thread.organizationId),
          eq(agentRuns.threadId, thread.id),
          eq(agentRuns.sessionId, input.sessionId),
          eq(agentRuns.userId, input.userId)
        )
      )
      .limit(1)
    const existing = rows[0]
    if (!existing) {
      throw new HttpError({ code: "not_found" })
    }
    const revokeRunGrants = () =>
      tx
        .update(agentGrants)
        .set({ revokedAt: now })
        .where(
          and(
            eq(agentGrants.organizationId, thread.organizationId),
            eq(agentGrants.runId, existing.id),
            isNull(agentGrants.revokedAt)
          )
        )
    if (
      existing.status !== "running" &&
      existing.status !== "waiting_approval"
    ) {
      if (existing.status === "canceled") {
        await cancelRunActionsInTransaction(tx, {
          organizationId: thread.organizationId,
          runId: existing.id,
          now,
        })
      }
      await revokeRunGrants()
      return { runId: existing.id, status: existing.status }
    }
    const canceledRows = await tx
      .update(agentRuns)
      .set({ status: "canceled", finishedAt: now })
      .where(
        and(
          eq(agentRuns.id, existing.id),
          eq(agentRuns.organizationId, thread.organizationId),
          eq(agentRuns.threadId, thread.id),
          eq(agentRuns.sessionId, input.sessionId),
          eq(agentRuns.userId, input.userId),
          inArray(agentRuns.status, ["running", "waiting_approval"])
        )
      )
      .returning({ id: agentRuns.id, status: agentRuns.status })
    const canceled = canceledRows[0]
    if (!canceled) {
      const concurrentRows = await tx
        .select({ id: agentRuns.id, status: agentRuns.status })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.id, existing.id),
            eq(agentRuns.organizationId, thread.organizationId),
            eq(agentRuns.threadId, thread.id),
            eq(agentRuns.sessionId, input.sessionId),
            eq(agentRuns.userId, input.userId)
          )
        )
        .limit(1)
      const concurrent = concurrentRows[0]
      if (!concurrent) {
        throw new HttpError({ code: "not_found" })
      }
      if (
        concurrent.status === "running" ||
        concurrent.status === "waiting_approval"
      ) {
        throw new HttpError({ code: "conflict" })
      }
      if (concurrent.status === "canceled") {
        await cancelRunActionsInTransaction(tx, {
          organizationId: thread.organizationId,
          runId: existing.id,
          now,
        })
      }
      await revokeRunGrants()
      return { runId: concurrent.id, status: concurrent.status }
    }
    await cancelRunActionsInTransaction(tx, {
      organizationId: thread.organizationId,
      runId: existing.id,
      now,
    })
    await revokeRunGrants()
    return { runId: canceled.id, status: canceled.status }
  })

export const finishAgentRun = (
  db: Db,
  input: { grant: string; outcome: "completed" | "failed"; now?: Date }
) => transitionAgentRun(db, { ...input, status: input.outcome })
