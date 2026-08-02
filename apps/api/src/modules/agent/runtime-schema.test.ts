import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { startAgentRunInputModel } from "./runtime-schema"

const runInput = (estimatedInputTokenCount: number) => ({
  clientMessageId: "message_budget",
  estimatedInputTokenCount,
  grant: "g".repeat(32),
})

describe("Agent runtime schema", () => {
  it("keeps estimated input within the Luna context after output reserve", () => {
    expect(
      v.safeParse(startAgentRunInputModel, runInput(1_045_904)).success
    ).toBe(true)
    expect(
      v.safeParse(startAgentRunInputModel, runInput(1_045_905)).success
    ).toBe(false)
  })
})
