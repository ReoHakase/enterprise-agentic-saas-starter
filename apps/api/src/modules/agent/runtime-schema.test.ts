import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { startAgentChatRunInputModel } from "./runtime-schema"

const runInput = (estimatedInputTokenCount: number) => ({
  clientMessageId: "message_budget",
  estimatedInputTokenCount,
  threadId: "thread_budget",
  ticket: "t".repeat(32),
})

describe("Agent runtime schema", () => {
  it("keeps estimated input within the Luna context after output reserve", () => {
    expect(
      v.safeParse(startAgentChatRunInputModel, runInput(1_045_904)).success
    ).toBe(true)
    expect(
      v.safeParse(startAgentChatRunInputModel, runInput(1_045_905)).success
    ).toBe(false)
  })
})
