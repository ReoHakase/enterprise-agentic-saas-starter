import { describe, expect, it } from "vitest"

import { estimateAgentContextBudget } from "./context"

describe("estimateAgentContextBudgetの契約", () => {
  it.each([
    [0, "normal"],
    [704, "notice"],
    [858, "warning"],
    [960, "critical"],
  ] as const)("添付pressure %iを%sとして算出する", (attachmentCount, level) => {
    const budget = estimateAgentContextBudget({
      attachmentCount,
      messages: [],
    })

    expect(budget.level).toBe(level)
    expect(budget.contextWindowTokens).toBe(1_050_000)
    expect(budget.reservedOutputTokens).toBe(4_096)
    expect(budget.observedInputTokens).toBeNull()
  })

  it("historyとpage contextと添付の見積を分離する", () => {
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
