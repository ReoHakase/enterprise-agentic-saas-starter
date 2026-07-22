import { render, screen } from "@testing-library/react"
import type { UIMessage } from "ai"
import { createElement } from "react"
import { describe, expect, it } from "vitest"

import { parseAgentMessages } from "@/features/agent/schema"

import {
  AgentApprovalAttachments,
  extractPendingActionIds,
} from "./agent-dashboard"

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

  it("projects persisted named tools into AI SDK dynamic tool parts", () => {
    const messages = parseAgentMessages([
      {
        id: "message-2",
        role: "assistant",
        parts: [
          {
            type: "tool-create_issue",
            toolCallId: "call-4",
            state: "output-available",
            input: { title: "Investigate screenshot" },
            output: { status: "pending", actionId: "action-2" },
          },
        ],
      },
    ])

    expect(messages[0]?.parts[0]).toMatchObject({
      type: "dynamic-tool",
      toolName: "create_issue",
      state: "output-available",
    })
    expect(extractPendingActionIds(messages)).toEqual(["action-2"])
  })

  it("shows the private image and permanence boundary before approval", () => {
    render(
      createElement(AgentApprovalAttachments, {
        organizationId: "org/acme",
        attachments: [
          {
            assetId: "asset one",
            filename: "incident.png",
            sizeBytes: 2048,
          },
        ],
      })
    )

    expect(
      screen.getByText(/become permanent Issue attachments/u)
    ).toBeInTheDocument()
    expect(screen.getByText(/temporary chat-image retention/u)).toBeVisible()
    expect(
      screen.getByRole("img", {
        name: "Attachment preview: incident.png",
      })
    ).toHaveAttribute(
      "src",
      expect.stringContaining(
        "/files/organizations/org%2Facme/agent-assets/asset%20one/preview/720"
      )
    )
  })
})
