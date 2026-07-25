import type { Meta, StoryObj } from "@storybook/react-vite"

import { IssueDetailRouteSkeleton } from "./issue-detail-route-skeleton"

const meta = {
  title: "Issues/Detail Route Skeleton",
  component: IssueDetailRouteSkeleton,
  tags: ["autodocs", "theme-sensitive"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof IssueDetailRouteSkeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = {}
