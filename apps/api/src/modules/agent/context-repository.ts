import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentConnectionTickets,
  agentGrants,
  agentRuns,
  agentSessionContexts,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"

type AgentTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

export const ensureAgentSessionContextInTransaction = async (
  tx: AgentTransaction,
  input: { sessionId: string; userId: string; now?: Date }
) => {
  const now = input.now ?? new Date()
  await tx
    .insert(agentSessionContexts)
    .values({
      sessionId: input.sessionId,
      userId: input.userId,
      contextEpoch: 1,
      updatedAt: now,
    })
    .onConflictDoNothing()

  const rows = await tx
    .select()
    .from(agentSessionContexts)
    .where(eq(agentSessionContexts.sessionId, input.sessionId))
    .limit(1)
  const context = rows[0]
  if (!context || context.userId !== input.userId) {
    throw new Error("Agent session context is inconsistent")
  }
  return context
}

export const revokeAgentSessionContextInTransaction = async (
  tx: AgentTransaction,
  input: { sessionId: string; userId: string; now?: Date }
) => {
  const now = input.now ?? new Date()
  const current = await ensureAgentSessionContextInTransaction(tx, {
    ...input,
    now,
  })
  const rows = await tx
    .update(agentSessionContexts)
    .set({
      contextEpoch: sql`${agentSessionContexts.contextEpoch} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentSessionContexts.sessionId, input.sessionId),
        eq(agentSessionContexts.userId, input.userId),
        eq(agentSessionContexts.contextEpoch, current.contextEpoch)
      )
    )
    .returning({ contextEpoch: agentSessionContexts.contextEpoch })
  const context = rows[0]
  if (!context) throw new Error("Agent context epoch update lost a race")

  // 0015以降のaction/policy/resume/asset leaseはcontext epoch更新triggerが
  // 同じtransaction内で失効させる。以下は0014由来の実行資源も明示的に閉じる。
  await tx
    .update(agentConnectionTickets)
    .set({ revokedAt: now })
    .where(
      and(
        eq(agentConnectionTickets.sessionId, input.sessionId),
        isNull(agentConnectionTickets.consumedAt),
        isNull(agentConnectionTickets.revokedAt)
      )
    )
  await tx
    .update(agentGrants)
    .set({ revokedAt: now })
    .where(
      and(
        eq(agentGrants.sessionId, input.sessionId),
        isNull(agentGrants.revokedAt)
      )
    )
  await tx
    .update(agentRuns)
    .set({ status: "canceled", finishedAt: now })
    .where(
      and(
        eq(agentRuns.sessionId, input.sessionId),
        inArray(agentRuns.status, ["running", "waiting_approval"])
      )
    )
  return context.contextEpoch
}

export const revokeAgentSessionContextsInTransaction = async (
  tx: AgentTransaction,
  contexts: readonly { sessionId: string; userId: string }[],
  now = new Date()
) => {
  for (const context of contexts) {
    // oxlint-disable-next-line no-await-in-loop -- 同じDB transaction内でepoch更新順を決定的に保つ。
    await revokeAgentSessionContextInTransaction(tx, { ...context, now })
  }
}
