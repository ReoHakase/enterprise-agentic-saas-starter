import { render, screen, waitFor } from "@testing-library/react"
import type { UIMessage } from "ai"
import { createElement, type ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { extractPendingActionIds } from "../../pending-action-ids"
import { parseAgentMessagePage } from "../../schema"
import { createPendingActionToolOutput } from "../../test-support/pending-action-fixture"
import { AgentApprovalAttachments } from "../agent-approval-attachments/agent-approval-attachments"
import { AgentMessage } from "../agent-message/agent-message"
import { issueLinksFromToolOutput } from "../issue-links-from-tool-output/issue-links-from-tool-output"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: ComponentProps<"a"> & { to: string }) =>
    createElement("a", { ...props, href: to }, children),
}))

const streamedWebSearchMessage = (
  state: "input-available" | "output-available"
) =>
  createElement(AgentMessage, {
    message: {
      id: "message-tool-open-state",
      role: "assistant" as const,
      parts: [
        state === "input-available"
          ? {
              type: "dynamic-tool" as const,
              toolName: "web_search",
              toolCallId: "call-web-search",
              state,
              input: { query: "AI SDK" },
            }
          : {
              type: "dynamic-tool" as const,
              toolName: "web_search",
              toolCallId: "call-web-search",
              state,
              input: { query: "AI SDK" },
              output: {
                sources: [{ title: "AI SDK", url: "https://ai-sdk.dev/" }],
              },
            },
      ],
    },
    organizationId: "org-1",
    organizationSlug: "acme",
    threadId: "thread-tool-open-state",
    frozen: false,
    onPendingChange: vi.fn<(actionId: string, pending: boolean) => void>(),
  })

describe("Agentアクションのprojection", () => {
  it("完了済みtool outputから正規action IDの重複を除く", () => {
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
            output: createPendingActionToolOutput("action-1"),
          },
          {
            type: "dynamic-tool",
            toolName: "create_issue",
            toolCallId: "call-2",
            state: "output-available",
            input: {},
            output: createPendingActionToolOutput("action-1"),
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

  it("永続化済みの名前付きtool partを保持する", () => {
    const { messages } = parseAgentMessagePage({
      messages: [
        {
          id: "message-2",
          role: "assistant",
          parts: [
            {
              type: "tool-create_issue",
              toolCallId: "call-4",
              state: "output-available",
              input: { title: "Investigate screenshot" },
              output: createPendingActionToolOutput("action-2"),
            },
          ],
        },
      ],
      total: 1,
      page: 0,
      perPage: 40,
      hasMore: false,
    })

    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool-create_issue",
      state: "output-available",
    })
    expect(extractPendingActionIds(messages)).toEqual(["action-2"])
  })

  it("承認前に非公開画像と永続化境界を表示する", () => {
    render(
      createElement(AgentApprovalAttachments, {
        organizationId: "org/acme",
        attachments: [
          {
            source: "asset",
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

  it("ツールtraceを折りたたみ、確認済みIssueリンクだけを表示する", () => {
    render(
      createElement(AgentMessage, {
        message: {
          id: "message-trace",
          role: "assistant",
          parts: [
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
        threadId: "thread-trace",
        frozen: false,
        onPendingChange: vi.fn<(actionId: string, pending: boolean) => void>(),
      })
    )

    expect(screen.queryByText("Searched Issues")).not.toBeInTheDocument()
    expect(
      screen.getByRole("group", { name: "Agent answer" })
    ).toHaveTextContent("The urgent Issue was confirmed.")
    expect(screen.queryByText(/"number": 7/u)).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "#7 Restore production access" })
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: "#7 Restore production access" })
    ).toHaveAttribute(
      "href",
      "/organization/acme/issues/7?agentThread=thread-trace"
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Search Issues · UrgentDone"
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Filters: UrgentResult: 1"
    )
  })

  it("reasoningとtoolのDOM順をstream順に保つ", () => {
    render(
      createElement(AgentMessage, {
        message: {
          id: "message-interleaved",
          role: "assistant",
          parts: [
            {
              type: "reasoning",
              text: "Search open urgent Issues first",
              state: "done",
            },
            {
              type: "dynamic-tool",
              toolName: "search_issues",
              toolCallId: "call-search-empty",
              state: "output-available",
              input: {
                status: "open",
                priority: "urgent",
                sortBy: "dueDate",
                sortDirection: "asc",
                limit: 50,
              },
              output: [],
            },
            {
              type: "reasoning",
              text: "Try the next priority",
              state: "done",
            },
          ],
        },
        organizationId: "org-1",
        organizationSlug: "acme",
        threadId: "thread-interleaved",
        frozen: false,
        onPendingChange: vi.fn<(actionId: string, pending: boolean) => void>(),
      })
    )

    const firstReasoning = screen.getByRole("button", {
      name: /Search open urgent Issues first/u,
    })
    const tool = screen.getByRole("status")
    const secondReasoning = screen.getByRole("button", {
      name: /Try the next priority/u,
    })
    expect(
      firstReasoning.compareDocumentPosition(tool) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      tool.compareDocumentPosition(secondReasoning) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("skillの指示内容を公開せず起動名を表示する", () => {
    render(
      createElement(AgentMessage, {
        message: {
          id: "message-skill",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "skill",
              toolCallId: "call-skill",
              state: "output-available",
              input: { name: "issue-triage" },
              output: "PRIVATE_SKILL_INSTRUCTIONS",
            },
          ],
        },
        organizationId: "org-1",
        organizationSlug: "acme",
        threadId: "thread-skill",
        frozen: false,
        onPendingChange: vi.fn<(actionId: string, pending: boolean) => void>(),
      })
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "Load Issue triage instructionsDone"
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loaded Issue triage instructions"
    )
    expect(screen.queryByText("PRIVATE_SKILL_INSTRUCTIONS")).toBeNull()
    expect(screen.queryByText("Run Agent tool")).toBeNull()
  })

  it("安全な詳細が届いてもストリーミング中のtoolを制御可能な折りたたみ表示に保つ", async () => {
    const consoleErrors: string[] = []
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) =>
        consoleErrors.push(args.map(String).join(" "))
      )
    const view = render(streamedWebSearchMessage("input-available"))
    view.rerender(streamedWebSearchMessage("output-available"))
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "AI SDK" })).toBeVisible()
    )
    consoleError.mockRestore()
    expect(consoleErrors.join("\n")).not.toContain(
      "changing the default open state of an uncontrolled Collapsible"
    )
  })

  it("アシスタント応答から重複する話者ラベルを省く", () => {
    render(
      createElement(AgentMessage, {
        message: {
          id: "message-plain",
          role: "assistant",
          parts: [{ type: "text", text: "A borderless answer" }],
        },
        organizationId: "org-1",
        organizationSlug: "acme",
        threadId: "thread-plain",
        frozen: false,
        onPendingChange: vi.fn<(actionId: string, pending: boolean) => void>(),
      })
    )

    expect(
      screen.getByRole("article", { name: "Agent response" })
    ).toBeVisible()
    expect(screen.queryByText("Issue agent")).not.toBeInTheDocument()
    expect(screen.queryByText("You")).not.toBeInTheDocument()
  })

  it("モデル本文や無関係なtool outputからIssueリンクを作らない", () => {
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
