import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"

import { requiresWebSearchFirstStep } from "../core/policy/web-search-request"

const forceWebSearchOnFirstStep = ({ stepNumber }: { stepNumber: number }) =>
  stepNumber === 0
    ? {
        toolChoice: { type: "tool" as const, toolName: "web_search" },
      }
    : undefined
export const productGenerationWebSearchOptions = (
  messages: readonly AgentUiMessage[],
  toolAllowlist?: readonly string[]
) =>
  requiresWebSearchFirstStep(messages, toolAllowlist)
    ? {
        prepareStep: forceWebSearchOnFirstStep,
      }
    : {}
