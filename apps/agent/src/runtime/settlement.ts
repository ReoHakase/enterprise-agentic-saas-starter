import type { AgentInternalGateway } from "../control-plane/client"

type RunSettlementApi = Pick<AgentInternalGateway, "cancelRun" | "finishRun">

export type RunSettlement = {
  cancel: () => Promise<void>
  complete: () => Promise<void>
  fail: () => Promise<void>
  holdForApproval: () => void
}

export const createRunSettlement = (
  api: RunSettlementApi,
  runGrant: string
): RunSettlement => {
  let state: "held" | "open" | "settled" = "open"

  const settle = async (
    outcome: "canceled" | "completed" | "failed"
  ): Promise<void> => {
    if (state !== "open") return
    state = "settled"
    try {
      if (outcome === "canceled") {
        await api.cancelRun({ grant: runGrant })
      } else {
        await api.finishRun({ grant: runGrant, outcome })
      }
    } catch {
      // API側のexpiry/reconcileを正本にし、provider payloadやgrantをlogへ出さない。
    }
  }

  return {
    cancel: () => settle("canceled"),
    complete: () => settle("completed"),
    fail: () => settle("failed"),
    holdForApproval: () => {
      if (state === "open") state = "held"
    },
  }
}
