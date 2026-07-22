import { describe, expect, it } from "vitest"

import { normalizeAgentUsage } from "./normalize"

describe("Agent usage normalization", () => {
  it("treats reasoning as part of output without double counting", () => {
    expect(
      normalizeAgentUsage({
        usage: {
          inputTokens: 100,
          inputTokenDetails: {
            cacheReadTokens: 20,
            cacheWriteTokens: 10,
          },
          outputTokens: 50,
          outputTokenDetails: { reasoningTokens: 30 },
          reasoningTokens: 30,
        },
        imageInputCount: 1,
        durationMs: 500,
        runEventId: "attempt_1",
      })
    ).toMatchObject({
      inputTokenCount: 100,
      inputNoCacheTokenCount: 70,
      cacheReadTokenCount: 20,
      cacheWriteTokenCount: 10,
      outputTokenCount: 50,
      textOutputTokenCount: 20,
      reasoningTokenCount: 30,
      totalTokenCount: 150,
    })
  })

  it("uses observed provider cost when available", () => {
    expect(
      normalizeAgentUsage({
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          raw: { cost: 0.001234 },
        },
        imageInputCount: 0,
        durationMs: 1,
        runEventId: "attempt_1",
      }).providerCostMicros
    ).toBe(1_234)
  })
})
