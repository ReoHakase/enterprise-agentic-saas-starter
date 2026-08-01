export const AGENT_MODEL_PROFILE = {
  contextWindowTokens: 1_050_000,
  id: "openrouter-gpt-5.6-luna-xhigh",
  model: "openai/gpt-5.6-luna",
  provider: "openrouter",
  reservedOutputTokens: 4_096,
} as const

export const PRODUCT_AGENT_REASONING = {
  effort: "xhigh",
  enabled: true,
} as const

export const AUXILIARY_AGENT_REASONING = {
  effort: "none",
  enabled: false,
} as const
