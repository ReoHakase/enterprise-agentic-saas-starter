import { http, HttpResponse } from "msw"
import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

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
      await userEvent.click(canvas.getByText(/get issue · output available/i))
      await expect(
        canvas.getByText(
          (_, element) =>
            element?.tagName === "PRE" &&
            element.textContent?.includes('"number": 184') === true
        )
      ).toBeVisible()
      await expect(
        canvas.getByRole("link", { name: "#184 Review tenant access" })
      ).toHaveAttribute("href", "/organization/acme-cloud/issues/184")
    })
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
