import { agentActions } from "@enterprise-agentic-saas/db/schema"
import { and, eq, sql } from "drizzle-orm"

import type { AgentTransaction } from "../threads/repository"
import {
  AgentActionWriteRaceError,
  executionResult,
  type ActionRow,
} from "./repository-support"

export type ExecutionReceipt = {
  issueId: string
  number: number
  revision: number
  deleted: boolean
  attachmentMutation?: {
    operation: "added" | "removed"
    fileIds: string[]
  }
}

export const expireActionIfNeeded = async (
  tx: AgentTransaction,
  action: ActionRow,
  now: Date
) => {
  if (action.expiresAt.getTime() > now.getTime()) return false
  await tx
    .update(agentActions)
    .set({ status: "expired", completedAt: now, updatedAt: now })
    .where(
      and(
        eq(agentActions.organizationId, action.organizationId),
        eq(agentActions.id, action.id),
        eq(agentActions.status, "approved")
      )
    )
  return true
}

export const claimActionExecution = async (
  tx: AgentTransaction,
  action: ActionRow,
  now: Date
) => {
  const claimed = await tx
    .update(agentActions)
    .set({
      attempt: sql`${agentActions.attempt} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentActions.organizationId, action.organizationId),
        eq(agentActions.id, action.id),
        eq(agentActions.status, "approved"),
        eq(agentActions.attempt, action.attempt)
      )
    )
    .returning({ id: agentActions.id })
  if (!claimed[0]) {
    throw new AgentActionWriteRaceError(
      "Agent action execution changed concurrently"
    )
  }
}

export const persistExecutionSuccess = async (
  tx: AgentTransaction,
  action: ActionRow,
  receipt: ExecutionReceipt,
  now: Date
) => {
  const succeededRows = await tx
    .update(agentActions)
    .set({
      status: "succeeded",
      receipt,
      resultId: action.targetId,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentActions.organizationId, action.organizationId),
        eq(agentActions.id, action.id),
        eq(agentActions.status, "approved")
      )
    )
    .returning()
  const succeeded = succeededRows[0]
  if (!succeeded) throw new Error("Agent action success transition lost")
  return executionResult(succeeded, receipt)
}
