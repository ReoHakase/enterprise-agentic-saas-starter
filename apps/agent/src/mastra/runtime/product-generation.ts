import type { AgentCanonicalMessage } from "@enterprise-agentic-saas/api/agent-client"

import { requiresWebSearchFirstStep } from "../core/policy/web-search-request"

const forceWebSearchOnFirstStep = ({ stepNumber }: { stepNumber: number }) =>
  stepNumber === 0
    ? {
        toolChoice: { type: "tool" as const, toolName: "web_search" },
      }
    : undefined
const defaultProviderOptions = {
  openrouter: {
    reasoning: { effort: "medium", exclude: false },
  },
} as const
const forcedToolProviderOptions = {
  openrouter: {
    // Alibaba rejects a forced tool choice while reasoning is enabled.
    reasoning: { enabled: false, effort: "none", exclude: true },
  },
} as const

export const productGenerationWebSearchOptions = (
  messages: readonly AgentCanonicalMessage[],
  toolAllowlist?: readonly string[]
) =>
  requiresWebSearchFirstStep(messages, toolAllowlist)
    ? {
        prepareStep: forceWebSearchOnFirstStep,
        providerOptions: forcedToolProviderOptions,
      }
    : { providerOptions: defaultProviderOptions }
