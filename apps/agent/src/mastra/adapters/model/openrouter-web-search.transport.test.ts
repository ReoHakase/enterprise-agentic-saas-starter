import { afterEach, describe, expect, it, vi } from "vitest"

import { searchWithTimeout } from "../../tools/web-search/search-timeout"
import { createDirectOpenRouterWebSearch } from "./openrouter-web-search"

type FetchCall = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

const providerResponse = {
  choices: [
    {
      finish_reason: "stop",
      index: 0,
      message: {
        annotations: [
          {
            type: "url_citation",
            url_citation: {
              title: "Public source",
              url: "https://example.com/source",
            },
          },
        ],
        content: "Public summary",
        role: "assistant",
      },
    },
  ],
  created: 1,
  id: "generation_1",
  model: "qwen/qwen3.6-flash",
  object: "chat.completion",
  usage: {
    completion_tokens: 1,
    prompt_tokens: 1,
    total_tokens: 2,
  },
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("direct OpenRouter Web search transport", () => {
  it("sends one bounded required-search request with only the guarded query", async () => {
    const fetchMock = vi.fn<FetchCall>(async () =>
      Response.json(providerResponse)
    )
    vi.stubGlobal("fetch", fetchMock)
    const search = createDirectOpenRouterWebSearch(
      "test-openrouter-key",
      "http://127.0.0.1/api/v1"
    )

    await expect(search('public "query"')).resolves.toMatchObject({
      finishReason: "stop",
      sources: [
        {
          payload: {
            sourceType: "url",
            title: "Public source",
            url: "https://example.com/source",
          },
          type: "source",
        },
      ],
      text: "Public summary",
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    const body = JSON.parse(String(init?.body))

    expect(url).toBe("http://127.0.0.1/api/v1/chat/completions")
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer test-openrouter-key"
    )
    expect(body).toMatchObject({
      max_tokens: 768,
      model: "qwen/qwen3.6-flash",
      parallel_tool_calls: false,
      plugins: [{ engine: "exa", id: "web", max_results: 3 }],
      temperature: 0,
      usage: { include: true },
    })
    expect(body).not.toHaveProperty("tools")
    expect(body).not.toHaveProperty("tool_choice")
    expect(JSON.stringify(body)).toContain(
      'Query JSON: \\"public \\\\\\"query\\\\\\"\\"'
    )
    expect(JSON.stringify(body)).not.toMatch(/organization_id|issue_id|tenant/u)
  })

  it("forwards caller abort to the provider request", async () => {
    const fetchMock = vi.fn<FetchCall>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true }
          )
        })
    )
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    const search = createDirectOpenRouterWebSearch(
      "test-openrouter-key",
      "http://127.0.0.1/api/v1"
    )
    const pending = search("public query", controller.signal)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    controller.abort(new DOMException("Stopped", "AbortError"))
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("aborts the actual provider request at the 25 second search boundary", async () => {
    const providerAbort = vi.fn<() => void>()
    const fetchMock = vi.fn<FetchCall>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              providerAbort()
              reject(init.signal?.reason)
            },
            { once: true }
          )
        })
    )
    vi.stubGlobal("fetch", fetchMock)
    const search = createDirectOpenRouterWebSearch(
      "test-openrouter-key",
      "http://127.0.0.1/api/v1"
    )
    vi.useFakeTimers()
    const pending = searchWithTimeout(search, "public query")
    const rejection = pending.catch((cause: unknown) => cause)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(25_000)
    await expect(rejection).resolves.toMatchObject({
      message: "Public Web search is unavailable",
    })
    expect(providerAbort).toHaveBeenCalledOnce()
  })
})
