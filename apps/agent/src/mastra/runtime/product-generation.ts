import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"

import { requiresWebSearchFirstStep } from "../core/policy/web-search-request"

const forceWebSearchOnFirstStep = ({ stepNumber }: { stepNumber: number }) =>
  stepNumber === 0
    ? {
        toolChoice: { type: "tool" as const, toolName: "web_search" },
      }
    : undefined
const reasoningDisabledProviderOptions = {
  openrouter: {
    // Keep Product Agent output useful and bounded; Alibaba also rejects a
    // forced tool choice while reasoning is enabled.
    reasoning: { enabled: false, effort: "none", exclude: true },
  },
} as const

export const productGenerationWebSearchOptions = (
  messages: readonly AgentUiMessage[],
  toolAllowlist?: readonly string[]
) =>
  requiresWebSearchFirstStep(messages, toolAllowlist)
    ? {
        prepareStep: forceWebSearchOnFirstStep,
        providerOptions: reasoningDisabledProviderOptions,
      }
    : { providerOptions: reasoningDisabledProviderOptions }
