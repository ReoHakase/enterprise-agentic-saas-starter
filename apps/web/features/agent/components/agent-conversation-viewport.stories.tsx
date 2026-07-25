import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent } from "storybook/test"

import { agentConversationTurns } from "../test-support/fixtures"
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

const meta = {
  title: "Agent/Conversation Viewport",
  component: AgentConversationViewport,
  tags: ["autodocs", "theme-sensitive"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    children: null,
    enabled: true,
    turns: conversationTurns,
  },
} satisfies Meta<typeof AgentConversationViewport>

export default meta
type Story = StoryObj<typeof meta>

export const WithMinimap: Story = {
  render: () => <ConversationFixture />,
  play: async ({ canvas }) => {
    const viewport = canvas.getByTestId("agent-conversation-viewport")
    await expect(viewport).toBeVisible()
    await userEvent.click(
      canvas.getByRole("button", {
        name: /Jump to turn 1: Review the organization access policy/u,
      })
    )
    await expect(viewport).toHaveProperty("scrollTop", 0)
  },
}
