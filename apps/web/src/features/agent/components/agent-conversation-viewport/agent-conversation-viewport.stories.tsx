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
  play: async ({ canvas }) => {
    const viewport = canvas.getByTestId("agent-conversation-viewport")
    await expect(viewport).toBeVisible()
    const content = canvas.getByTestId("agent-conversation-content")
    const viewportRect = viewport.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    expect(contentRect.width).toBeLessThanOrEqual(768)
    expect(contentRect.left + contentRect.width / 2).toBeCloseTo(
      viewportRect.left + viewportRect.width / 2,
      0
    )
    await expect(
      canvas.queryByRole("navigation", { name: "Conversation turns" })
    ).toBeVisible()
    const firstTurn = canvas.getByRole("button", {
      name: /Turn 1へ移動: Review the organization access policy/u,
    })
    await userEvent.click(firstTurn)
    await expect(firstTurn).toHaveAttribute("aria-current", "location")
  },
})
