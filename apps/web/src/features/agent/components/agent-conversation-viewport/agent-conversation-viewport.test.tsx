import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { AgentChatMessage } from "../../schema"
import {
  buildAgentConversationGroups,
  type AgentConversationTurnPreview,
} from "./agent-conversation-groups"
import { AgentConversationViewport } from "./agent-conversation-viewport"

vi.mock(
  "@enterprise-agentic-saas/ui/components/ai-elements/conversation",
  () => ({
    Conversation: ({ children, ...props }: React.ComponentProps<"div">) => (
      <div {...props}>{children}</div>
    ),
    ConversationContent: ({
      children,
      ...props
    }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    ConversationScrollButton: () => (
      <button type="button">Jump to latest message</button>
    ),
    useConversation: () => ({
      scrollRef: { current: null },
      stopScroll: vi.fn<() => void>(),
    }),
  })
)

const previewMessages: AgentChatMessage[] = [
  {
    id: "turn-1",
    role: "user",
    parts: [
      { type: "text", text: "  Review\nthis Issue  " },
      {
        type: "data-context-reference",
        data: { kind: "issue", id: "issue-1", label: "Issue #1" },
      },
      {
        type: "data-agent-assets",
        data: { assetIds: ["asset-1", "asset-2"] },
      },
    ],
  },
  {
    id: "answer-1",
    role: "assistant",
    parts: [
      { type: "text", text: "I reviewed the Issue and prepared a fix." },
      {
        type: "dynamic-tool",
        toolName: "get_issue",
        toolCallId: "tool-1",
        state: "output-available",
        input: { number: 1 },
        output: { number: 1 },
      },
    ],
  },
  {
    id: "turn-2",
    role: "user",
    parts: [
      {
        type: "data-agent-assets",
        data: { assetIds: ["asset-3"] },
      },
    ],
  },
]
const minimapTurns: AgentConversationTurnPreview[] = [
  {
    id: "turn-1",
    prompt: "First request",
    response: "First response",
    imageCount: 0,
    contextCount: 0,
    toolCount: 0,
  },
  {
    id: "turn-2",
    prompt: "Second request",
    imageCount: 0,
    contextCount: 0,
    toolCount: 2,
  },
]
describe("AgentConversationViewportの契約", () => {
  it("直前の利用者ターンへアシスタントメッセージをまとめる", () => {
    const groups = buildAgentConversationGroups(previewMessages)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.messages).toHaveLength(2)
    expect(groups[0]?.turn).toEqual({
      id: "turn-1",
      prompt: "Review this Issue @Issue #1",
      response: "I reviewed the Issue and prepared a fix.",
      imageCount: 2,
      contextCount: 1,
      toolCount: 1,
    })
    expect(groups[1]?.turn).toMatchObject({
      id: "turn-2",
      prompt: "Image request",
    })
  })

  it("標準会話の横にターンミニマップを配置する", () => {
    render(
      <AgentConversationViewport enabled turns={minimapTurns}>
        <p>Conversation</p>
      </AgentConversationViewport>
    )

    expect(
      screen.getByRole("navigation", { name: "Conversation turns" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Jump to turn 1: First request" })
    ).toBeVisible()
  })

  it("自動追従会話に最新メッセージへの移動操作を表示する", () => {
    render(
      <AgentConversationViewport enabled>
        <p>Conversation</p>
      </AgentConversationViewport>
    )

    expect(
      screen.getByRole("button", { name: "Jump to latest message" })
    ).toBeInTheDocument()
  })

  it("専用ページでは最新メッセージへの移動操作を表示しない", () => {
    render(
      <AgentConversationViewport enabled={false}>
        <p>Dedicated page conversation</p>
      </AgentConversationViewport>
    )

    expect(
      screen.queryByRole("button", { name: "Jump to latest message" })
    ).not.toBeInTheDocument()
  })
})
