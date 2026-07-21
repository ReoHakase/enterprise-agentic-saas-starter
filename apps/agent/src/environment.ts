import type { AgentInternalApiContract } from "@enterprise-agentic-saas/api/agent-client"

type TypedAgentInternalApi = CloudflareEnv["AGENT_INTERNAL_API"] &
  AgentInternalApiContract

export type AgentRuntimeEnv = CloudflareEnv & {
  AGENT_INTERNAL_API: TypedAgentInternalApi
  OPENROUTER_API_KEY?: string
}
