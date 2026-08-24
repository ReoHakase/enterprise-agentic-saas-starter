import type { AgentUiMessage } from "@enterprise-agentic-saas/agent-contracts"
import { describe, expect, it } from "vitest"

import { requiresWebSearchFirstStep } from "./web-search-request"

const userMessage = (text: string): AgentUiMessage => ({
  id: crypto.randomUUID(),
  parts: [{ text, type: "text" }],
  role: "user",
})

describe("明示的なWeb検索request", () => {
  it.each([
    [
      "Use public Web search and cite the official source.\nPublic-only Web query: official Cloudflare Workers CPU time limits",
    ],
    [
      "公開情報をWeb検索してください。\n公開情報だけのWeb検索：Cloudflare Workers CPU time limits",
    ],
  ])("明示的なWeb検索request%#では最初のstepにWeb検索を要求する", (text) => {
    expect(requiresWebSearchFirstStep([userMessage(text)])).toBe(true)
  })

  it("明示的requestと独立query一行の両方を要求する", () => {
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

  it("最新の利用者messageだけを使ってeval allowlistを尊重する", () => {
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
