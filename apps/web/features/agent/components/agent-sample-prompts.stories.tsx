import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent } from "storybook/test"

import { AgentSamplePrompts } from "./agent-sample-prompts"

const meta = {
  title: "Agent/Sample Prompts",
  component: AgentSamplePrompts,
  tags: ["autodocs", "theme-sensitive"],
  args: {
    onSelect: fn(),
  },
} satisfies Meta<typeof AgentSamplePrompts>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Summarize the current page and suggest the next action.",
      })
    )
    await expect(args.onSelect).toHaveBeenCalledWith(
      "Summarize the current page and suggest the next action."
    )
  },
}
