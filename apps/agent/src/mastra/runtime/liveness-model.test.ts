import { simulateReadableStream, streamText } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { describe, expect, it, vi } from "vitest"

import { withRunLiveness } from "./liveness-model"

const streamedModel = () =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start" as const, id: "text_1" },
          ...Array.from({ length: 20 }, (_, index) => ({
            type: "text-delta" as const,
            id: "text_1",
            delta: String(index),
          })),
          { type: "text-end" as const, id: "text_1" },
          {
            type: "finish" as const,
            finishReason: { unified: "stop" as const, raw: undefined },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 20,
                text: 20,
                reasoning: undefined,
              },
            },
          },
        ],
      }),
    }),
  })

describe("withRunLivenessの契約", () => {
  it("provider開始直前とstream完了後だけ生存を確認する", async () => {
    const assertLive = vi.fn<() => Promise<void>>().mockResolvedValue()
    const result = streamText({
      model: withRunLiveness(streamedModel(), assertLive),
      prompt: "test",
    })

    await expect(result.text).resolves.toBe(
      Array.from({ length: 20 }, (_, index) => String(index)).join("")
    )
    expect(assertLive).toHaveBeenCalledTimes(2)
  })

  it("最初の生存確認に失敗した場合はproviderを開始しない", async () => {
    const cause = new Error("revoked before provider")
    const model = streamedModel()
    const onError = vi.fn<(event: { error: unknown }) => void>()
    const result = streamText({
      model: withRunLiveness(model, async () => {
        throw cause
      }),
      onError,
      prompt: "test",
    })

    await expect(result.text).rejects.toMatchObject({
      name: "AI_NoOutputGeneratedError",
    })
    expect(model.doStreamCalls).toHaveLength(0)
    expect(onError).toHaveBeenCalledWith({ error: cause })
  })

  it("二度目の生存確認に失敗した場合は完了を拒否する", async () => {
    const cause = new Error("revoked before completion")
    let callCount = 0
    const result = streamText({
      model: withRunLiveness(streamedModel(), async () => {
        callCount += 1
        if (callCount === 2) throw cause
      }),
      prompt: "test",
    })

    await expect(result.text).rejects.toBe(cause)
    expect(callCount).toBe(2)
  })
})
