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

describe("getAgentWaitingStateの契約", () => {
  it("送信またはheader受信後は最初の可視stream partを待つ", () => {
    expect(getAgentWaitingState("submitted", [])).toBe("first-byte")
    expect(getAgentWaitingState("streaming", [])).toBe("first-byte")
    expect(
      getAgentWaitingState("streaming", [
        assistantMessage([{ type: "step-start" }]),
      ])
    ).toBe("first-byte")
  })

  it("処理中partの進捗UIを重複表示しない", () => {
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

  it("tool result受信後から次のpartまで継続中の進捗を表示する", () => {
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
