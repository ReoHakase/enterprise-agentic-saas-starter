export type AgentToolKind = "client" | "read" | "write"

export type AgentToolBudget = {
  consume: (kind: AgentToolKind) => void
  suspendForApproval: () => void
}

export const createAgentToolBudget = (
  limits: { calls?: number; writes?: number } = {}
): AgentToolBudget => {
  const maximumCalls = limits.calls ?? 20
  const maximumWrites = limits.writes ?? 5
  let calls = 0
  let writes = 0
  let suspendedForApproval = false

  return {
    consume(kind) {
      if (suspendedForApproval) {
        throw new Error("Agent tools suspended for approval")
      }
      if (calls >= maximumCalls) throw new Error("Agent tool limit reached")
      if (kind === "write" && writes >= maximumWrites) {
        throw new Error("Agent write action limit reached")
      }

      calls += 1
      if (kind === "write") writes += 1
    },
    suspendForApproval() {
      suspendedForApproval = true
    },
  }
}
