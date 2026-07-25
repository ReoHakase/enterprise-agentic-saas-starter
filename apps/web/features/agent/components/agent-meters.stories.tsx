import { TooltipProvider } from "@enterprise-agentic-saas/ui/components/tooltip"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"

import { agentContextBudgetMessages } from "../test-support/scenarios"
import { AgentMeters } from "./agent-meters"

const meta = {
  title: "Agent/Context Meter",
  component: AgentMeters,
  tags: ["autodocs", "theme-sensitive"],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: {
    streamedMessages: [...agentContextBudgetMessages.estimated],
  },
} satisfies Meta<typeof AgentMeters>

export default meta
type Story = StoryObj<typeof meta>

export const Estimated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.hover(
      canvas.getByRole("button", { name: "Estimated context 1% used" })
    )
    await waitFor(() =>
      expect(canvas.getByText("Estimated breakdown")).toBeVisible()
    )
  },
}

export const NearLimit: Story = {
  args: {
    streamedMessages: [...agentContextBudgetMessages.nearLimit],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await expect(
      canvas.getByRole("button", { name: "Last request context 95% used" })
    ).toBeVisible()
  },
}
