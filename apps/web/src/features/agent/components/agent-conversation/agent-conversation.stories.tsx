import { http, HttpResponse } from "msw"
import { fn } from "storybook/test"

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
        HttpResponse.json({
          messages: [
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
          ],
          total: 2,
          page: 0,
          perPage: 100,
          hasMore: false,
        })
      )
    )
  },
})

export const Empty = meta.story({})

export const HistoryFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/agent/threads/:threadId/messages", () =>
        HttpResponse.json(
          {
            error: "service_unavailable",
            message: "The service is temporarily unavailable.",
          },
          { status: 503 }
        )
      )
    )
  },
})
