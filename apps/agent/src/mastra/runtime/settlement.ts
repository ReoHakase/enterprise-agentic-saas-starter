import type { AgentUsageRecordInput } from "@enterprise-agentic-saas/agent-contracts"

import type { AgentControlPlanePort } from "./ports"

type RunSettlementApi = Pick<AgentControlPlanePort, "finalizeRun">

export type RunSettlement = {
  cancel: (usage?: AgentUsageRecordInput) => Promise<void>
  complete: (usage?: AgentUsageRecordInput) => Promise<"completed" | null>
  fail: (usage?: AgentUsageRecordInput) => Promise<void>
  holdForApproval: () => void
}

export const createRunSettlement = (
  api: RunSettlementApi,
  runGrant: string,
  onFailure?: (cause: unknown) => void
): RunSettlement => {
  let state: "held" | "open" | "settled" = "open"

  const settle = async (
    outcome: "canceled" | "completed" | "failed",
    usage?: AgentUsageRecordInput
  ): Promise<string | null> => {
    if (state === "settled") return null
    const finalOutcome =
      state === "held" && outcome === "completed"
        ? ("waiting_approval" as const)
        : outcome
    state = "settled"
    try {
      return (
        await api.finalizeRun({
          grant: runGrant,
          outcome: finalOutcome,
          usage,
        })
      ).status
    } catch (cause) {
      // API側のexpiry/reconcileを正本にし、provider payloadやgrantをlogへ出さない。
      try {
        onFailure?.(cause)
      } catch (reportingCause) {
        void reportingCause
        // 観測境界の失敗でrunのbest-effort精算を再失敗させない。
      }
      return null
    }
  }

  return {
    cancel: async (usage) => {
      await settle("canceled", usage)
    },
    complete: async (usage) =>
      (await settle("completed", usage)) === "completed" ? "completed" : null,
    fail: async (usage) => {
      await settle("failed", usage)
    },
    holdForApproval: () => {
      if (state === "open") state = "held"
    },
  }
}
