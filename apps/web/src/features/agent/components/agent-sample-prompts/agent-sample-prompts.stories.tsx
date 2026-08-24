import { fn } from "storybook/test"

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

export const Ready = meta.story({})
