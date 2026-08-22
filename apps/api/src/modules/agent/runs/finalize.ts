import type {
  AgentRunResult,
  AgentUsageRecordInput,
} from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"

import { HttpError } from "../../../errors/http-error"
import {
  cancelAgentRun,
  finishAgentRun,
  withRunGrant,
} from "../threads/repository"
import { recordAgentUsage } from "../usage/repository"

export type FinalizeAgentRunInput = {
  grant: string
  outcome: "canceled" | "completed" | "failed" | "waiting_approval"
  usage?: AgentUsageRecordInput
  now?: Date
}

const preserveWaitingApprovalRun = (
  db: Db,
  input: Pick<FinalizeAgentRunInput, "grant" | "now">
): Promise<AgentRunResult> =>
  withRunGrant(db, input, async (_tx, context) => {
    if (!context.runId || context.runStatus !== "waiting_approval") {
      throw new HttpError({ code: "conflict" })
    }
    return { runId: context.runId, status: context.runStatus }
  })

const settleAgentRun = (
  db: Db,
  input: Pick<FinalizeAgentRunInput, "grant" | "now" | "outcome">
): Promise<AgentRunResult> => {
  if (input.outcome === "canceled") {
    return cancelAgentRun(db, input)
  }
  if (input.outcome === "waiting_approval") {
    return preserveWaitingApprovalRun(db, input)
  }
  return finishAgentRun(db, {
    grant: input.grant,
    now: input.now,
    outcome: input.outcome,
  })
}

export const finalizeAgentRun = async (
  db: Db,
  input: FinalizeAgentRunInput
): Promise<AgentRunResult> => {
  let usageFailure: unknown
  if (input.usage) {
    try {
      await recordAgentUsage(db, {
        ...input.usage,
        grant: input.grant,
        now: input.now,
      })
    } catch (cause) {
      usageFailure = cause
    }
  }

  const result = await settleAgentRun(db, {
    grant: input.grant,
    now: input.now,
    outcome: input.outcome,
  })
  if (usageFailure) {
    throw new Error("Agent usage finalization failed", { cause: usageFailure })
  }
  return result
}
