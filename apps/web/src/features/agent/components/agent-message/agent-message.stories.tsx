import { http, HttpResponse } from "msw"
import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import type { AgentChatMessage } from "../../schema"
import {
  fictionalAgentIdentity,
  fictionalAgentMessages,
  fictionalPendingAction,
  fictionalPrimaryAgentThread,
} from "../../test-support/fixtures"
import { AgentMessage } from "./agent-message"

const meta = preview.meta({
  title: "Web/Agent/Message",
  component: AgentMessage,
  tags: ["autodocs"],
  args: {
    frozen: false,
    message: fictionalAgentMessages.richAssistant,
    onPendingChange: fn(),
    organizationId: fictionalAgentIdentity.organizationId,
    organizationSlug: fictionalAgentIdentity.organizationSlug,
    threadId: fictionalPrimaryAgentThread.id,
  },
})

export const UserMessage = meta.story({
  args: { message: fictionalAgentMessages.user },
})

export const RichAssistantMessage = meta.story({
  tags: ["theme-sensitive"],
  beforeEach() {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: fn().mockResolvedValue(undefined) },
    })
    return () => {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor)
      else Reflect.deleteProperty(navigator, "clipboard")
    }
  },
  play: async ({ canvas, step }) => {
    await step("応答をコピーすると完了状態を表示する", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy response" })
      )
      await expect(
        canvas.getByRole("button", { name: "Response copied" })
      ).toBeVisible()
    })
  },
})

export const Source = meta.story({
  args: { message: fictionalAgentMessages.reasoningAndSources },
})

export const ToolResult = meta.story({
  args: { message: fictionalAgentMessages.toolSucceeded },
})

export const ServerToolRunning = meta.story({
  args: {
    message: {
      id: "assistant-tool-running",
      role: "assistant",
      parts: [
        {
          type: "tool-web_search",
          toolCallId: "call-search-running",
          state: "input-available",
          input: { query: "Cloudflare request signal compatibility" },
        },
      ],
    } satisfies AgentChatMessage,
  },
})

export const FailedTool = meta.story({
  args: {
    message: {
      id: "assistant-tool-failed",
      role: "assistant",
      parts: [
        {
          type: "tool-get_issue",
          toolCallId: "call-failed",
          state: "output-error",
          input: { lookup: "id", id: "issue-184" },
          errorText: "Issue read failed.",
        },
      ],
    } satisfies AgentChatMessage,
  },
})

export const ApprovalDeclined = meta.story({
  args: {
    message: {
      id: "assistant-tool-denied",
      role: "assistant",
      parts: [
        {
          type: "tool-update_issue",
          toolCallId: "call-denied",
          state: "approval-responded",
          input: {
            issueId: "issue-184",
            expectedRevision: 3,
            title: "Declined title",
          },
          approval: { id: "approval-denied", approved: false },
        },
      ],
    } satisfies AgentChatMessage,
  },
})

export const AttachmentReceipt = meta.story({
  args: {
    message: {
      id: "assistant-attachment-receipt",
      role: "assistant",
      parts: [
        {
          type: "tool-add_issue_attachments",
          toolCallId: "call-attachment-receipt",
          state: "output-available",
          input: {
            assetIds: ["asset-opaque"],
            expectedRevision: 3,
            issueId: "issue-184",
          },
          output: {
            actionId: "action-opaque",
            operation: "added",
            issueId: "issue-184",
            issueNumber: 184,
            revision: 4,
            fileIds: ["file-opaque"],
          },
        },
      ],
    } satisfies AgentChatMessage,
  },
})

export const ApprovalRequired = meta.story({
  args: { message: fictionalAgentMessages.approvalPending },
  beforeEach({ msw }) {
    msw.use(
      http.get("*/agent/actions/action-pending", () =>
        HttpResponse.json(fictionalPendingAction)
      )
    )
  },
})

export const LongResponse = meta.story({
  args: { message: fictionalAgentMessages.longAssistant },
})
