import type { AgentInternalFetchBinding } from "@enterprise-agentic-saas/agent-contracts"

type TypedAgentInternalApi = CloudflareEnv["AGENT_INTERNAL_API"] &
  AgentInternalFetchBinding

export type AgentRuntimeEnv = CloudflareEnv & {
  AGENT_EVAL_ALLOWED_TOOLS?: string
  AGENT_RUNS_ENABLED?: string
  AGENT_VISION_ENABLED?: string
  AGENT_WRITES_ENABLED?: string
  NODE_ENV?: string
  AGENT_INTERNAL_API: TypedAgentInternalApi
  OPENROUTER_API_KEY?: string
  OPENROUTER_BASE_URL?: string
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT?: string
  SENTRY_RELEASE?: string
  SENTRY_TRACES_SAMPLE_RATE?: string
}
