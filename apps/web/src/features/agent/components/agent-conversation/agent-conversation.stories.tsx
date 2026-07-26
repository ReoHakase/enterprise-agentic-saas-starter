import { http, HttpResponse } from "msw"
import { expect, fn } from "storybook/test"

import preview from "#storybook/preview"

import {
  AgentStoryScope,
  fictionalAgentIdentity,
  fictionalPrimaryAgentThread,
} from "../../test-support/fixtures"
import { AgentConversation } from "./agent-conversation"

const ConversationExample = () => (
  <AgentConversation
    autoSubmit={false}
    disabled={false}
    onAutoSubmit={fn()}
    onInitialComposerSnapshotConsumed={fn()}
    organizationId={fictionalAgentIdentity.organizationId}
    organizationSlug={fictionalAgentIdentity.organizationSlug}
    presentation="page"
    thread={fictionalPrimaryAgentThread}
  />
)

const meta = preview.meta({
  title: "Web/Agent/Conversation",
  component: ConversationExample,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AgentStoryScope>
        <Story />
      </AgentStoryScope>
    ),
  ],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(
      http.get("*/agent/threads/:threadId/messages", () =>
        HttpResponse.json([
          {
            id: "message_01K1USERREQUEST000000000",
            role: "user",
            parts: [
              {
                type: "text",
                text: "Review Issue #184 and verify the tenant boundary.",
              },
            ],
          },
          {
            id: "message_01K1ASSISTANT0000000000",
            role: "assistant",
            parts: [
              {
                type: "text",
                text: "Membership is checked before every repository read.",
              },
            ],
          },
        ])
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("Render history and the live composer", async () => {
      await expect(
        await canvas.findByRole("article", { name: "Your message" })
      ).toHaveTextContent("Review Issue #184")
      await expect(
        canvas.getByRole("article", { name: "Agent response" })
      ).toHaveTextContent("Membership is checked")
      await expect(
        canvas.getByRole("textbox", { name: "Agent message" })
      ).toBeVisible()
    })
  },
})

export const Empty = meta.story({
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("button", {
        name: "Summarize the current page and suggest the next action.",
      })
    ).toBeVisible()
  },
})

export const HistoryFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/agent/threads/:threadId/messages", () =>
        HttpResponse.json({ message: "Unavailable" }, { status: 503 })
      )
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Agent history could not be loaded."
    )
    await expect(
      canvas.getByRole("button", { name: "Try again" })
    ).toBeVisible()
  },
})
