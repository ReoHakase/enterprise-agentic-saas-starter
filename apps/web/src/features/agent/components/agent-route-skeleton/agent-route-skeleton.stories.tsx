import preview from "#storybook/preview"

import { AgentRouteSkeleton } from "./agent-route-skeleton"

const meta = preview.meta({
  title: "Agent/Route Skeleton",
  component: AgentRouteSkeleton,
  tags: ["autodocs", "theme-sensitive"],
  parameters: { layout: "fullscreen" },
})

export const Loading = meta.story({})
