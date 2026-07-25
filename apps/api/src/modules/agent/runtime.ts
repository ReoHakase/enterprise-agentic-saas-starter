export type AgentRuntimeBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

let runtime: AgentRuntimeBinding | undefined

/** Worker entrypointだけがprivate Agent Workerへのcapabilityを登録する。 */
export const configureAgentRuntime = (next: AgentRuntimeBinding): void => {
  runtime = next
}

/** @internal */
export const resetAgentRuntimeForTest = (): void => {
  runtime = undefined
}

export const getAgentRuntime = (): AgentRuntimeBinding => {
  if (!runtime) throw new Error("Agent runtime is not configured")
  return runtime
}
