import type { AgentInternalFetchBinding } from "@enterprise-agentic-saas/agent-contracts"

export type PortableAgentRuntimeEnv = {
  AGENT_E2E_RUN_ID?: string
  AGENT_EVAL_ALLOWED_TOOLS?: string
  AGENT_RUNS_ENABLED?: string
  AGENT_VISION_ENABLED?: string
  AGENT_WRITES_ENABLED?: string
  DEV_SESSION_ID?: string
  DEV_WORKTREE_ID?: string
  NODE_ENV?: string
  AGENT_INTERNAL_API: AgentInternalFetchBinding
  MASTRA_STORAGE_AUTH_TOKEN?: string
  MASTRA_STORAGE_URL?: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_BASE_URL?: string
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
}

type TypedAgentInternalApi = CloudflareEnv["AGENT_INTERNAL_API"] &
  AgentInternalFetchBinding

export type AgentRuntimeEnv = CloudflareEnv &
  Omit<PortableAgentRuntimeEnv, "AGENT_INTERNAL_API"> & {
    AGENT_INTERNAL_API: TypedAgentInternalApi
  }
