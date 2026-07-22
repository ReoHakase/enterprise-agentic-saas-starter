import type { AgentInternalApiContract } from "@enterprise-agentic-saas/api/agent-client"

type TypedAgentInternalApi = CloudflareEnv["AGENT_INTERNAL_API"] &
  AgentInternalApiContract

export type AgentRuntimeEnv = CloudflareEnv & {
  AGENT_RUNS_ENABLED?: string
  AGENT_VISION_ENABLED?: string
  AGENT_WRITES_ENABLED?: string
  NODE_ENV?: string
  AGENT_INTERNAL_API: TypedAgentInternalApi
  OPENROUTER_API_KEY?: string
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT?: string
  SENTRY_RELEASE?: string
  SENTRY_TRACES_SAMPLE_RATE?: string
}
