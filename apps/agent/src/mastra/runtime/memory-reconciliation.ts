import type { PortableAgentRuntimeEnv } from "../composition/environment"
import { reconcilePendingMemoryCommits } from "../workflows/memory-commit"
import type {
  AgentExecutionContext,
  AgentRuntimeDependencies,
} from "./run-agent"

export const scheduleMemoryReconciliation = (
  environment: PortableAgentRuntimeEnv,
  context: AgentExecutionContext,
  dependencies: AgentRuntimeDependencies
) => {
  const api = dependencies.createControlPlane(environment.AGENT_INTERNAL_API)
  context.waitUntil(
    reconcilePendingMemoryCommits(dependencies.mastra, api).catch(
      () => undefined
    )
  )
}
