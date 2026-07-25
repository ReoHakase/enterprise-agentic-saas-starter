import type { Meta, StoryObj } from "@storybook/react-vite"

import { AgentRouteSkeleton } from "./agent-route-skeleton"

const meta = {
  title: "Agent/Route Skeleton",
  component: AgentRouteSkeleton,
  tags: ["autodocs", "theme-sensitive"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AgentRouteSkeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = {}
