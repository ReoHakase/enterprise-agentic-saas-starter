import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { agentConversationTurns } from "../../test-support/fixtures"
import { AgentConversationViewport } from "./agent-conversation-viewport"

const conversationTurns = [...agentConversationTurns]

const ConversationFixture = () => (
  <div className="flex h-96 min-w-0">
    <AgentConversationViewport enabled turns={conversationTurns}>
      {agentConversationTurns.map((turn) => (
        <article
          key={turn.id}
          data-agent-turn-id={turn.id}
          className="min-h-72 rounded-2xl border p-5"
        >
          <h2 className="font-medium">{turn.prompt}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{turn.response}</p>
        </article>
      ))}
    </AgentConversationViewport>
  </div>
)

const meta = preview.meta({
  title: "Agent/Conversation Viewport",
  component: AgentConversationViewport,
  tags: ["autodocs", "theme-sensitive"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    children: null,
    enabled: true,
  },
})

export const CenteredConversation = meta.story({
  render: () => <ConversationFixture />,
  play: async ({ canvas, step }) => {
    await step("turn minimapから最初のturnへ移動する", async () => {
      const firstTurn = canvas.getByRole("button", {
        name: /Jump to turn 1: Review the organization access policy/u,
      })
      await userEvent.click(firstTurn)
      await expect(firstTurn).toHaveAttribute("aria-current", "location")
    })
  },
})
