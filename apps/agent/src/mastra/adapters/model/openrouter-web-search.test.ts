import { generateText } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createDirectOpenRouterWebSearch } from "./openrouter-web-search"

vi.mock("ai", { spy: true })

const mockedGenerateText = vi.mocked(generateText)

describe("直接OpenRouter Web検索adapter", () => {
  beforeEach(() => mockedGenerateText.mockReset())

  it("guard済みqueryだけを直列化して平坦なURL sourceを投影する", async () => {
    mockedGenerateText.mockResolvedValue(
      JSON.parse(
        '{"finishReason":"stop","sources":[{"sourceType":"url","id":"source_1","url":"https://example.com/evidence","title":"Evidence"}],"text":"Summary"}'
      )
    )
    const signal = new AbortController().signal
    const search = createDirectOpenRouterWebSearch("test-key")

    await expect(search('public "query"', signal)).resolves.toEqual({
      finishReason: "stop",
      sources: [
        {
          type: "source",
          payload: {
            sourceType: "url",
            title: "Evidence",
            url: "https://example.com/evidence",
          },
        },
      ],
      text: "Summary",
    })
    const options = mockedGenerateText.mock.calls[0]?.[0]
    expect(options?.abortSignal).toBe(signal)
    expect(options?.maxRetries).toBe(0)
    expect(options?.toolChoice).toBeUndefined()
    expect(options?.tools).toBeUndefined()
    expect(options?.prompt).toContain('Query JSON: "public \\"query\\""')
    expect(options?.prompt).not.toMatch(/tenant|organization_id|issue_id/u)
  })

  it("OpenRouterがsource evidenceを返さない場合は安全側に失敗する", async () => {
    mockedGenerateText.mockResolvedValue(
      JSON.parse('{"finishReason":"stop","sources":[],"text":"Summary"}')
    )
    const search = createDirectOpenRouterWebSearch("test-key")

    await expect(search("public query")).rejects.toThrow(
      "Public Web search is unavailable"
    )
  })
})
