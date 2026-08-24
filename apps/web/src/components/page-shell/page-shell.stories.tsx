import preview from "#storybook/preview"

import { PageShell } from "./page-shell"

const meta = preview.meta({
  title: "Web/Shared/Page Shell",
  component: PageShell,
  tags: ["autodocs"],
  args: {
    title: "Issues",
    description: "Track tenant-scoped work.",
    actionHref: "/organization/acme/issues/new",
    actionLabel: "New issue",
    children: (
      <div className="h-40 rounded-2xl border p-4">Current sprint content</div>
    ),
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
})

export const LoadingBoundary = meta.story({
  args: {
    boundaryState: "loading",
    actionHref: undefined,
    actionLabel: undefined,
  },
})

export const MobileLongCopy = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    title: "Organization security and tenant authorization",
    description:
      "Review every organization boundary before updating permissions or destructive settings.",
  },
})
