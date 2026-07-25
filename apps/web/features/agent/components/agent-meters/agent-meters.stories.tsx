import { TooltipProvider } from "@enterprise-agentic-saas/ui/components/tooltip"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { agentContextBudgetMessages } from "../../test-support/fixtures"
import { AgentMeters } from "./agent-meters"

const meta = preview.meta({
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
})

export const Estimated = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.hover(
      canvas.getByRole("button", { name: "Estimated context 1% used" })
    )
    await waitFor(() =>
      expect(canvas.getByText("Estimated breakdown")).toBeVisible()
    )
  },
})

export const NearLimit = meta.story({
  args: {
    streamedMessages: [...agentContextBudgetMessages.nearLimit],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await expect(
      canvas.getByRole("button", { name: "Last request context 95% used" })
    ).toBeVisible()
  },
})
