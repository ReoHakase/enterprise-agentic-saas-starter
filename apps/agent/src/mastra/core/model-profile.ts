import {
  AGENT_MODEL_CONTEXT_WINDOW_TOKENS,
  AGENT_MODEL_RESERVED_OUTPUT_TOKENS,
} from "@enterprise-agentic-saas/agent-contracts"

export const AGENT_MODEL_PROFILE = {
  contextWindowTokens: AGENT_MODEL_CONTEXT_WINDOW_TOKENS,
  id: "openrouter-gpt-5.6-luna-xhigh",
  model: "openai/gpt-5.6-luna",
  provider: "openrouter",
  reservedOutputTokens: AGENT_MODEL_RESERVED_OUTPUT_TOKENS,
} as const

export const PRODUCT_AGENT_REASONING = {
  effort: "xhigh",
  enabled: true,
} as const

export const AUXILIARY_AGENT_REASONING = {
  effort: "none",
  enabled: false,
} as const
