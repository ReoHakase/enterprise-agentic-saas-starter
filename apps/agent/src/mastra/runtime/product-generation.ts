import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"

import { requiresWebSearchFirstStep } from "../core/policy/web-search-request"

const forceWebSearchOnFirstStep = ({ stepNumber }: { stepNumber: number }) =>
  stepNumber === 0
    ? {
        toolChoice: { type: "tool" as const, toolName: "web_search" },
      }
    : undefined
const defaultProviderOptions = {
  openrouter: {
    reasoning: { effort: "low", exclude: true },
  },
} as const
const forcedToolProviderOptions = {
  openrouter: {
    // Alibaba rejects a forced tool choice while reasoning is enabled.
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
        providerOptions: forcedToolProviderOptions,
      }
    : { providerOptions: defaultProviderOptions }
