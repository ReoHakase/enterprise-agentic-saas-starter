import type { AgentCanonicalMessage } from "@enterprise-agentic-saas/agent-contracts"
import { describe, expect, it } from "vitest"

import { requiresWebSearchFirstStep } from "./web-search-request"

const userMessage = (text: string): AgentCanonicalMessage => ({
  id: crypto.randomUUID(),
  parts: [{ text, type: "text" }],
  role: "user",
})

describe("explicit Web search request", () => {
  it.each([
    [
      "Use public Web search and cite the official source.\nPublic-only Web query: official Cloudflare Workers CPU time limits",
    ],
    [
      "公開情報をWeb検索してください。\n公開情報だけのWeb検索：Cloudflare Workers CPU time limits",
    ],
  ])("requires Web search on the first step for %s", (text) => {
    expect(requiresWebSearchFirstStep([userMessage(text)])).toBe(true)
  })

  it("requires both an explicit request and exactly one standalone query line", () => {
    expect(
      requiresWebSearchFirstStep([
        userMessage(
          "Public-only Web query: official Cloudflare Workers CPU time limits"
        ),
      ])
    ).toBe(false)
    expect(
      requiresWebSearchFirstStep([
        userMessage(
          "Use public Web search.\nPrefix Public-only Web query: official source"
        ),
      ])
    ).toBe(false)
    expect(
      requiresWebSearchFirstStep([
        userMessage(
          "Use public Web search.\nPublic-only Web query: official source\nPublic-only Web query: another source"
        ),
      ])
    ).toBe(false)
  })

  it("uses only the latest user message and respects the eval allowlist", () => {
    const authorized = userMessage(
      "Use public Web search.\nPublic-only Web query: official source"
    )
    expect(
      requiresWebSearchFirstStep(
        [authorized, userMessage("Explain the previous answer.")],
        ["web_search"]
      )
    ).toBe(false)
    expect(requiresWebSearchFirstStep([authorized], ["search_issues"])).toBe(
      false
    )
    expect(requiresWebSearchFirstStep([authorized], ["web_search"])).toBe(true)
  })
})
