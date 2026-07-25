import type { AgentChatMessage } from "../schema"

export const agentContextBudgetMessages = {
  estimated: [
    {
      id: "message-budget-estimated",
      role: "assistant",
      parts: [
        {
          type: "data-context-budget",
          data: {
            contextWindowTokens: 1_000_000,
            reservedOutputTokens: 4_096,
            estimated: {
              system: 2_000,
              skills: 3_000,
              tools: 6_000,
              history: 1_000,
              pageContext: 500,
              attachments: 2,
              total: 12_502,
            },
            observedInputTokens: null,
            level: "normal",
          },
        },
      ],
    } satisfies AgentChatMessage,
  ],
  nearLimit: [
    {
      id: "message-budget-near-limit",
      role: "assistant",
      parts: [
        {
          type: "data-context-budget",
          data: {
            contextWindowTokens: 100_000,
            reservedOutputTokens: 4_096,
            estimated: {
              system: 12_000,
              skills: 8_000,
              tools: 20_000,
              history: 48_000,
              pageContext: 6_000,
              attachments: 1_000,
              total: 95_000,
            },
            observedInputTokens: 95_000,
            level: "critical",
          },
        },
      ],
    } satisfies AgentChatMessage,
  ],
} as const

export const agentConversationTurns = [
  {
    id: "turn-1",
    prompt: "Review the organization access policy.",
    response: "The current policy is scoped to the active organization.",
    imageCount: 0,
    contextCount: 1,
    toolCount: 1,
  },
  {
    id: "turn-2",
    prompt: "Summarize the highest priority Issue.",
    response: "The urgent Issue needs an owner and a due date.",
    imageCount: 0,
    contextCount: 1,
    toolCount: 1,
  },
  {
    id: "turn-3",
    prompt: "Prepare the next safe action.",
    response: "I prepared a read-only review before requesting approval.",
    imageCount: 1,
    contextCount: 1,
    toolCount: 1,
  },
] as const
