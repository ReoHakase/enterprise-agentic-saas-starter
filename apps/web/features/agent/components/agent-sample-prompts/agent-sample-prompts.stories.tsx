import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { AgentSamplePrompts } from "./agent-sample-prompts"

const meta = preview.meta({
  title: "Agent/Sample Prompts",
  component: AgentSamplePrompts,
  tags: ["autodocs", "theme-sensitive"],
  args: {
    onSelect: fn(),
  },
})

export const Ready = meta.story({
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
})
