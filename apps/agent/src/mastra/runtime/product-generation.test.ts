import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"
import { describe, expect, it } from "vitest"

import { productGenerationWebSearchOptions } from "./product-generation"

const userMessage = (text: string): AgentUiMessage => ({
  id: crypto.randomUUID(),
  parts: [{ text, type: "text" }],
  role: "user",
})

describe("Product Agent generation options", () => {
  it.each([
    ["Explain the current Issue.", false],
    [
      "Use public Web search.\nPublic-only Web query: official Cloudflare Workers limits",
      true,
    ],
  ])("disables reasoning for %s", (text, expectsForcedSearch) => {
    const options = productGenerationWebSearchOptions(
      [userMessage(text)],
      ["web_search"]
    )

    expect(options.providerOptions).toEqual({
      openrouter: {
        reasoning: { enabled: false, effort: "none", exclude: true },
      },
    })
    expect("prepareStep" in options).toBe(expectsForcedSearch)
  })

  it("forces the guarded Web search only on the first step", () => {
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
