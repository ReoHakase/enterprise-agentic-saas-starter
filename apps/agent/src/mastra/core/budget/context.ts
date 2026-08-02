import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"

import { AGENT_MODEL_PROFILE } from "../model-profile"

export type AgentContextBudgetEstimate = {
  contextWindowTokens: number
  reservedOutputTokens: number
  estimated: {
    system: number
    skills: number
    tools: number
    history: number
    pageContext: number
    attachments: number
    total: number
  }
  observedInputTokens: number | null
  level: "normal" | "notice" | "warning" | "critical"
}

const estimatedTokens = (value: unknown) =>
  Math.ceil(JSON.stringify(value).length / 4)

const budgetLevel = (
  usedTokens: number
): AgentContextBudgetEstimate["level"] => {
  const ratio = usedTokens / AGENT_MODEL_PROFILE.contextWindowTokens
  if (ratio >= 0.95) return "critical"
  if (ratio >= 0.85) return "warning"
  if (ratio >= 0.7) return "notice"
  return "normal"
}

export const estimateAgentContextBudget = (input: {
  messages: readonly AgentUiMessage[]
  attachmentCount: number
  pageContext?: unknown
}): AgentContextBudgetEstimate => {
  // system/skills/toolsはmodel profileに固定されたpromptとschemaの保守的な概算。
  const system = 2_000
  const skills = 3_000
  const tools = 6_000
  const history = estimatedTokens(input.messages)
  const pageContext = input.pageContext ? estimatedTokens(input.pageContext) : 0
  const attachments = input.attachmentCount * 1_024
  const total = system + skills + tools + history + pageContext + attachments
  return {
    contextWindowTokens: AGENT_MODEL_PROFILE.contextWindowTokens,
    reservedOutputTokens: AGENT_MODEL_PROFILE.reservedOutputTokens,
    estimated: {
      system,
      skills,
      tools,
      history,
      pageContext,
      attachments,
      total,
    },
    observedInputTokens: null,
    level: budgetLevel(total + AGENT_MODEL_PROFILE.reservedOutputTokens),
  }
}
