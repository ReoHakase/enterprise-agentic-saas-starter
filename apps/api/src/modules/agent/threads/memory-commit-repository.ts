import type { Db } from "@enterprise-agentic-saas/db"
import { agentGrants, agentRuns } from "@enterprise-agentic-saas/db/schema"
import { withWriteTransaction } from "@enterprise-agentic-saas/db/write-transaction"
import { and, eq, isNull } from "drizzle-orm"

import type {
  AgentMemoryCommitSettlement,
  AgentMemoryCommitSettlementInput,
} from "../../../agent-client"
import { isRetryableDatabaseRace } from "./repository-support"

const settleAgentMemoryCommitInTransaction = async (
  tx: Db,
  input: AgentMemoryCommitSettlementInput & { now?: Date }
): Promise<AgentMemoryCommitSettlement> => {
  const acknowledgement = {
    acknowledged: true as const,
    applicationRunId: input.applicationRunId,
  }
  const now = input.now ?? new Date()
  const rows = await tx
    .select({
      id: agentRuns.id,
      organizationId: agentRuns.organizationId,
      status: agentRuns.status,
    })
    .from(agentRuns)
    .where(eq(agentRuns.id, input.applicationRunId))
    .limit(1)
  const run = rows[0]
  if (!run || run.status !== "running") return acknowledgement

  const completed = await tx
    .update(agentRuns)
    .set({ status: "completed", finishedAt: now })
    .where(
      and(
        eq(agentRuns.id, run.id),
        eq(agentRuns.organizationId, run.organizationId),
        eq(agentRuns.status, "running")
      )
    )
    .returning({ id: agentRuns.id })
  if (!completed[0]) return acknowledgement

  await tx
    .update(agentGrants)
    .set({ revokedAt: now })
    .where(
      and(
        eq(agentGrants.organizationId, run.organizationId),
        eq(agentGrants.runId, run.id),
        isNull(agentGrants.revokedAt)
      )
    )
  return acknowledgement
}

const settleAgentMemoryCommitWithRetry = async (
  db: Db,
  input: AgentMemoryCommitSettlementInput & { now?: Date },
  attempt: number
): Promise<AgentMemoryCommitSettlement> => {
  try {
    return await withWriteTransaction(db, (transaction) =>
      settleAgentMemoryCommitInTransaction(transaction, input)
    )
  } catch (cause) {
    if (isRetryableDatabaseRace(cause) && attempt < 8) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
      return settleAgentMemoryCommitWithRetry(db, input, attempt + 1)
    }
    throw cause
  }
}

export const settleAgentMemoryCommit = (
  db: Db,
  input: AgentMemoryCommitSettlementInput & { now?: Date }
) => settleAgentMemoryCommitWithRetry(db, input, 0)
