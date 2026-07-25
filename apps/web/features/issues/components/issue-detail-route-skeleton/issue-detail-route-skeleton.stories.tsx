import preview from "#storybook/preview"

import { IssueDetailRouteSkeleton } from "./issue-detail-route-skeleton"

const meta = preview.meta({
  title: "Issues/Detail Route Skeleton",
  component: IssueDetailRouteSkeleton,
  tags: ["autodocs", "theme-sensitive"],
  parameters: { layout: "fullscreen" },
})

export const Loading = meta.story({})
