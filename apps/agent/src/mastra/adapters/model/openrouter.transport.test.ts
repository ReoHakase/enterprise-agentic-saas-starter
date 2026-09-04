import { generateText } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createAgentModel } from "./openrouter"

type FetchCall = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

afterEach(() => vi.unstubAllGlobals())

describe("Product AgentのOpenRouter transport", () => {
  it("返却reasoningを除外せずLuna xhigh reasoningを送る", async () => {
    const fetchMock = vi.fn<FetchCall>(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "done", role: "assistant" },
          },
        ],
        created: 1,
        id: "generation_1",
        model: "openai/gpt-5.6-luna",
        object: "chat.completion",
        usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await generateText({
      maxRetries: 0,
      model: createAgentModel("test-openrouter-key", "http://127.0.0.1/api/v1"),
      prompt: "test",
    })

    const [, init] = fetchMock.mock.calls[0] ?? []
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({
      model: "openai/gpt-5.6-luna",
      reasoning: { effort: "xhigh", enabled: true },
      usage: { include: true },
    })
    expect(body.reasoning).not.toHaveProperty("exclude")
  })
})
