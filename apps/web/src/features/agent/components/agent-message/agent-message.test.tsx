import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { AgentChatMessage } from "../../schema"
import { AgentMessage } from "./agent-message"

const renderMessage = (message: AgentChatMessage, threadId: string) =>
  render(
    <AgentMessage
      frozen={false}
      message={message}
      organizationId="organization-1"
      organizationSlug="acme"
      threadId={threadId}
      onPendingChange={vi.fn<(id: string, pending: boolean) => void>()}
    />
  )

describe("Agentメッセージ", () => {
  it("不透明なIDを公開せず添付ファイル操作の結果を表示する", () => {
    renderMessage(
      {
        id: "assistant-attachment-receipt",
        role: "assistant",
        parts: [
          {
            type: "tool-remove_issue_attachments",
            toolCallId: "call-remove-attachment",
            state: "output-available",
            input: {
              expectedRevision: 4,
              fileIds: ["private-file-id"],
              issueId: "private-issue-id",
            },
            output: {
              actionId: "private-action-id",
              operation: "removed",
              issueId: "private-issue-id",
              issueNumber: 184,
              revision: 5,
              fileIds: ["private-file-id"],
            },
          },
        ],
      },
      "thread-attachment-receipt"
    )

    expect(screen.getByText(/Removed 1 attachment/u)).toHaveTextContent(
      "Removed 1 attachment on Issue #184 at revision 5."
    )
    expect(screen.getByRole("link", { name: "Issue #184" })).toHaveAttribute(
      "href",
      "/organization/acme/issues/184?agentThread=thread-attachment-receipt"
    )
    expect(screen.queryByText(/private-file-id|private-issue-id/u)).toBeNull()
  })

  it("正規のWeb情報源を重複させずに表示する", () => {
    renderMessage(
      {
        id: "assistant-web-search",
        role: "assistant",
        parts: [
          {
            type: "tool-web_search",
            toolCallId: "call-web-search",
            state: "output-available",
            input: { query: "Cloudflare Workers compatibility flags" },
            output: {
              content: "Cloudflare Workers compatibility flags documentation.",
              sources: [
                {
                  title: "Cloudflare Workers compatibility flags",
                  url: "https://developers.cloudflare.com/workers/configuration/compatibility-flags/",
                },
              ],
              trust: "untrusted_public_web_content",
            },
          },
          {
            type: "source-url",
            sourceId: "source-web-search",
            title: "Cloudflare Workers compatibility flags",
            url: "https://developers.cloudflare.com/workers/configuration/compatibility-flags/",
          },
        ],
      },
      "thread-web-search"
    )

    expect(
      screen.getAllByRole("link", {
        name: "Cloudflare Workers compatibility flags",
      })
    ).toHaveLength(1)
  })
})
