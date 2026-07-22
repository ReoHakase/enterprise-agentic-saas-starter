import { describe, expect, it } from "vitest"

import {
  AGENT_CONTEXT_WINDOW_TOKENS,
  AGENT_RESERVED_OUTPUT_TOKENS,
  estimateAgentContextBudget,
} from "./budget"

describe("estimateAgentContextBudget", () => {
  it.each([
    [0, "normal"],
    [669, "notice"],
    [816, "warning"],
    [913, "critical"],
  ] as const)(
    "projects attachment pressure %i as %s",
    (attachmentCount, level) => {
      const budget = estimateAgentContextBudget({
        attachmentCount,
        messages: [],
      })

      expect(budget.level).toBe(level)
      expect(budget.contextWindowTokens).toBe(AGENT_CONTEXT_WINDOW_TOKENS)
      expect(budget.reservedOutputTokens).toBe(AGENT_RESERVED_OUTPUT_TOKENS)
      expect(budget.observedInputTokens).toBeNull()
    }
  )

  it("separates history, page context, and attachment estimates", () => {
    const budget = estimateAgentContextBudget({
      attachmentCount: 2,
      messages: [
        {
          id: "message_1",
          role: "user",
          parts: [{ type: "text", text: "Inspect this page" }],
        },
      ],
      pageContext: {
        kind: "current_page",
        path: "/organization/acme/issues/7",
      },
    })

    expect(budget.estimated.history).toBeGreaterThan(0)
    expect(budget.estimated.pageContext).toBeGreaterThan(0)
    expect(budget.estimated.attachments).toBe(2_048)
    expect(budget.estimated.total).toBe(
      Object.entries(budget.estimated)
        .filter(([key]) => key !== "total")
        .reduce((sum, [, value]) => sum + value, 0)
    )
  })
})
