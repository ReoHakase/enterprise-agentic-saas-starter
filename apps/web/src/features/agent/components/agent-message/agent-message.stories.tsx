import { http, HttpResponse } from "msw"
import { expect, fn } from "storybook/test"

import preview from "#storybook/preview"

import type { AgentChatMessage } from "../../schema"
import {
  fictionalAgentIdentity,
  fictionalAgentMessages,
  fictionalPendingAction,
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
  },
})

export const UserMessage = meta.story({
  args: { message: fictionalAgentMessages.user },
  play: async ({ canvas, step }) => {
    await step("Identify the user-authored turn", async () => {
      await expect(
        canvas.getByRole("article", { name: "Your message" })
      ).toHaveTextContent("Review Issue #184")
      await expect(
        canvas.getByText(/Issue #184: Review tenant access/)
      ).toBeVisible()
    })
  },
})

export const RichAssistantMessage = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step(
      "Render Markdown, code, table, CJK, math, and Mermaid",
      async () => {
        await expect(
          await canvas.findByRole("heading", { name: "Access review" })
        ).toBeVisible()
        await expect(canvas.getByRole("table")).toBeVisible()
        await expect(canvas.getByText(/日本語と English/)).toBeVisible()
      }
    )
  },
})

export const Source = meta.story({
  args: { message: fictionalAgentMessages.reasoningAndSources },
  play: async ({ canvas, step }) => {
    await step("Expose the source", async () => {
      await expect(
        canvas.getByRole("link", {
          name: "Tenant authorization architecture",
        })
      ).toHaveAttribute(
        "href",
        "https://architecture.example.test/tenant-authorization"
      )
    })
  },
})

export const ToolResult = meta.story({
  args: { message: fictionalAgentMessages.toolSucceeded },
  play: async ({ canvas, step }) => {
    await step("Inspect a completed tool call", async () => {
      await expect(canvas.getByRole("status")).toHaveTextContent(
        "get issue · completed"
      )
      await expect(canvas.queryByText(/"number": 184/u)).not.toBeInTheDocument()
      await expect(
        canvas.getByRole("link", { name: "#184 Review tenant access" })
      ).toHaveAttribute("href", "/organization/acme-cloud/issues/184")
    })
  },
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
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "web search · running"
    )
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
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "get issue · failed"
    )
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
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "update issue · denied"
    )
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
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Added 1 attachment on/u)).toHaveTextContent(
      "Added 1 attachment on Issue #184 at revision 4."
    )
    await expect(
      canvas.queryByText(/asset-opaque|file-opaque/u)
    ).not.toBeInTheDocument()
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
  play: async ({ canvas, step }) => {
    await step("Render the canonical approval preview", async () => {
      await expect(
        await canvas.findByText("Approve Issue change?")
      ).toBeVisible()
      await expect(canvas.getByRole("button", { name: "Yes" })).toBeEnabled()
      await expect(canvas.getByText("tenant-policy.png")).toBeVisible()
    })
  },
})

export const LongResponse = meta.story({
  args: { message: fictionalAgentMessages.longAssistant },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("article", { name: "Agent response" })
    ).toHaveTextContent("Verify control 12")
  },
})
