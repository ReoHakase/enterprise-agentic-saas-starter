import { describe, expect, it } from "vitest"

import { normalizeAgentUsage } from "./normalize"

describe("Agent usage正規化", () => {
  it("reasoningを二重計上せず出力の一部として扱う", () => {
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

  it("観測済みprovider costがある場合はそれを使う", () => {
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

  it("全model stepの観測済みOpenRouter costを合計する", () => {
    expect(
      normalizeAgentUsage({
        usage: {
          inputTokens: 1,
          outputTokens: 1,
        },
        stepProviderMetadata: [
          { openrouter: { usage: { cost: 0.000_000_4 } } },
          { openrouter: { usage: { cost: 0.000_000_4 } } },
        ],
        imageInputCount: 0,
        durationMs: 1,
        runEventId: "attempt_1",
      }).providerCostMicros
    ).toBe(1)
  })

  it.each([
    [
      "欠損",
      [
        { openrouter: { usage: { cost: 0.001 } } },
        { openrouter: { usage: {} } },
      ],
    ],
    ["負数", [{ openrouter: { usage: { cost: -0.001 } } }]],
    ["非有限", [{ openrouter: { usage: { cost: Number.NaN } } }]],
  ])(
    "step costが%sの場合は見積costへfallbackする",
    (_, stepProviderMetadata) => {
      expect(
        normalizeAgentUsage({
          usage: {
            inputTokens: 1,
            outputTokens: 1,
          },
          stepProviderMetadata,
          imageInputCount: 0,
          durationMs: 1,
          runEventId: "attempt_1",
        }).providerCostMicros
      ).toBeUndefined()
    }
  )
})
