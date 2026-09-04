import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"
import { describe, expect, it } from "vitest"

import { productGenerationWebSearchOptions } from "./product-generation"

const userMessage = (text: string): AgentUiMessage => ({
  id: crypto.randomUUID(),
  parts: [{ text, type: "text" }],
  role: "user",
})

describe("Product Agent生成option", () => {
  it.each([
    ["Explain the current Issue.", false],
    [
      "Use public Web search.\nPublic-only Web query: official Cloudflare Workers limits",
      true,
    ],
  ])("入力%#でproduct reasoningを保持する", (text, expectsForcedSearch) => {
    const options = productGenerationWebSearchOptions(
      [userMessage(text)],
      ["web_search"]
    )

    expect(options).not.toHaveProperty("providerOptions")
    expect("prepareStep" in options).toBe(expectsForcedSearch)
  })

  it("guard済みWeb検索を最初のstepだけで強制する", () => {
    const options = productGenerationWebSearchOptions(
      [
        userMessage(
          "Use public Web search.\nPublic-only Web query: official Cloudflare Workers limits"
        ),
      ],
      ["web_search"]
    )

    expect(options.prepareStep?.({ stepNumber: 0 })).toEqual({
      toolChoice: { type: "tool", toolName: "web_search" },
    })
    expect(options.prepareStep?.({ stepNumber: 1 })).toBeUndefined()
  })
})
