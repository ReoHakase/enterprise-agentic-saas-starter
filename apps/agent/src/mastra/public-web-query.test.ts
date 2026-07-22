import { describe, expect, it } from "vitest"

import {
  extractExplicitPublicWebSearchQuery,
  matchesExplicitPublicWebSearchQuery,
} from "./public-web-query"

describe("explicit public Web search boundary", () => {
  it.each([
    ["Web検索: Cloudflare R2 limits", "Cloudflare R2 limits"],
    ["ウェブ検索： Mastra Cloudflare deploy", "Mastra Cloudflare deploy"],
    [
      "この情報だけを公開検索してください。\nPublic Web検索: Qwen OpenRouter model ID",
      "Qwen OpenRouter model ID",
    ],
  ])(
    "extracts an explicitly declassified current-message query",
    (text, query) => {
      expect(extractExplicitPublicWebSearchQuery(text)).toBe(query)
    }
  )

  it.each([
    "Acme買収条件は50億円",
    "WebでAcme買収条件は50億円を調べて",
    "Web検索:",
    `Web検索: ${"x".repeat(201)}`,
  ])(
    "does not infer a public query from private natural language: %s",
    (text) => {
      expect(extractExplicitPublicWebSearchQuery(text)).toBeNull()
    }
  )

  it("rejects model-added private terms instead of forwarding them", () => {
    expect(
      matchesExplicitPublicWebSearchQuery(
        "Cloudflare R2 limits",
        "Cloudflare R2 limits Acme買収条件50億円"
      )
    ).toBe(false)
    expect(
      matchesExplicitPublicWebSearchQuery(
        "Cloudflare   R2 limits",
        "cloudflare r2 LIMITS"
      )
    ).toBe(true)
  })
})
