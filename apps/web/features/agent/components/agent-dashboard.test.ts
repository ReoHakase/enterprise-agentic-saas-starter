import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"

import { extractPendingActionIds } from "./agent-dashboard"

describe("agent action projection", () => {
  it("deduplicates canonical action IDs from completed tool outputs", () => {
    const messages: UIMessage[] = [
      {
        id: "message-1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "create_issue",
            toolCallId: "call-1",
            state: "output-available",
            input: {},
            output: { status: "pending", actionId: "action-1" },
          },
          {
            type: "dynamic-tool",
            toolName: "create_issue",
            toolCallId: "call-2",
            state: "output-available",
            input: {},
            output: { status: "pending", actionId: "action-1" },
          },
          {
            type: "dynamic-tool",
            toolName: "search_issues",
            toolCallId: "call-3",
            state: "output-available",
            input: {},
            output: { status: "completed" },
          },
        ],
      },
    ]

    expect(extractPendingActionIds(messages)).toEqual(["action-1"])
  })
})
