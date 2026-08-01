import { describe, expect, it } from "vitest"

import type { AgentChatMessage } from "../../schema"
import { getAgentWaitingState } from "./agent-waiting-state"

const assistantMessage = (
  parts: AgentChatMessage["parts"]
): AgentChatMessage => ({
  id: "assistant-1",
  role: "assistant",
  parts,
})

describe("getAgentWaitingState", () => {
  it("waits for the first visible stream part after submission or headers", () => {
    expect(getAgentWaitingState("submitted", [])).toBe("first-byte")
    expect(getAgentWaitingState("streaming", [])).toBe("first-byte")
    expect(
      getAgentWaitingState("streaming", [
        assistantMessage([{ type: "step-start" }]),
      ])
    ).toBe("first-byte")
  })

  it("does not duplicate the progress UI of an active part", () => {
    expect(
      getAgentWaitingState("streaming", [
        assistantMessage([
          { type: "reasoning", text: "Reviewing", state: "streaming" },
        ]),
      ])
    ).toBeUndefined()
    expect(
      getAgentWaitingState("streaming", [
        assistantMessage([
          {
            type: "dynamic-tool",
            toolName: "search_issues",
            toolCallId: "call-1",
            state: "input-available",
            input: { status: "open" },
          },
        ]),
      ])
    ).toBeUndefined()
  })

  it("shows continuation progress after a tool result until the next part", () => {
    expect(
      getAgentWaitingState("streaming", [
        assistantMessage([
          {
            type: "dynamic-tool",
            toolName: "search_issues",
            toolCallId: "call-1",
            state: "output-available",
            input: { status: "open" },
            output: [],
          },
        ]),
      ])
    ).toBe("continuation")
    expect(
      getAgentWaitingState("ready", [
        assistantMessage([
          {
            type: "dynamic-tool",
            toolName: "search_issues",
            toolCallId: "call-1",
            state: "output-available",
            input: { status: "open" },
            output: [],
          },
        ]),
      ])
    ).toBeUndefined()
  })
})
