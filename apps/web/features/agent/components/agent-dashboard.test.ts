import { render, screen } from "@testing-library/react"
import type { UIMessage } from "ai"
import { createElement } from "react"
import { describe, expect, it, vi } from "vitest"

import { parseAgentMessages } from "@/features/agent/schema"

import { AgentApprovalAttachments } from "./agent-approval-card"
import { extractPendingActionIds } from "./agent-conversation"
import { AgentMessage, issueLinksFromToolOutput } from "./agent-message"

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

  it("renders reasoning and tool trace collapsed with only confirmed Issue links", () => {
    render(
      createElement(AgentMessage, {
        message: {
          id: "message-trace",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "I should inspect the urgent Issues." },
            {
              type: "data-activity",
              data: {
                kind: "tool",
                status: "completed",
                label: "Searched Issues",
              },
            },
            { type: "text", text: "The urgent Issue was confirmed." },
            {
              type: "dynamic-tool",
              toolName: "search_issues",
              toolCallId: "call-search",
              state: "output-available",
              input: { priority: "urgent" },
              output: [{ number: 7, title: "Restore production access" }],
            },
          ],
        },
        organizationId: "org-1",
        organizationSlug: "acme",
        frozen: false,
        onPendingChange: vi.fn<(actionId: string, pending: boolean) => void>(),
      })
    )

    expect(
      screen.getByText("I should inspect the urgent Issues.")
    ).not.toBeVisible()
    expect(screen.getByText("Searched Issues")).toBeVisible()
    expect(
      screen.getByRole("group", { name: "Agent answer" })
    ).toHaveTextContent("The urgent Issue was confirmed.")
    expect(screen.getByText(/"number": 7/u)).not.toBeVisible()
    expect(
      screen.getByRole("link", { name: "#7 Restore production access" })
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: "#7 Restore production access" })
    ).toHaveAttribute("href", "/organization/acme/issues/7")
  })

  it("does not create Issue links from model text or unrelated tool output", () => {
    expect(issueLinksFromToolOutput("create_issue", { number: 9 })).toEqual([])
    expect(
      issueLinksFromToolOutput("create_issue", {
        issue: { number: 9, title: "Created safely" },
      })
    ).toEqual([{ number: 9, title: "Created safely" }])
    expect(
      issueLinksFromToolOutput("search_issues", { text: "Issue #9" })
    ).toEqual([])
  })
})
