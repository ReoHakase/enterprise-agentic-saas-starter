import type { AgentControlPlanePort } from "./ports"

type RunSettlementApi = Pick<AgentControlPlanePort, "cancelRun" | "finishRun">

export type RunSettlement = {
  cancel: () => Promise<void>
  complete: () => Promise<"completed" | null>
  fail: () => Promise<void>
  holdForApproval: () => void
  isHeldForApproval: () => boolean
}

export const createRunSettlement = (
  api: RunSettlementApi,
  runGrant: string
): RunSettlement => {
  let state: "held" | "open" | "settled" = "open"

  const settle = async (
    outcome: "canceled" | "completed" | "failed"
  ): Promise<string | null> => {
    if (state !== "open") return null
    state = "settled"
    try {
      if (outcome === "canceled") {
        return (await api.cancelRun({ grant: runGrant })).status
      }
      return (await api.finishRun({ grant: runGrant, outcome })).status
    } catch {
      // API側のexpiry/reconcileを正本にし、provider payloadやgrantをlogへ出さない。
      return null
    }
  }

  return {
    cancel: async () => {
      await settle("canceled")
    },
    complete: async () =>
      (await settle("completed")) === "completed" ? "completed" : null,
    fail: async () => {
      await settle("failed")
    },
    holdForApproval: () => {
      if (state === "open") state = "held"
    },
    isHeldForApproval: () => state === "held",
  }
}
