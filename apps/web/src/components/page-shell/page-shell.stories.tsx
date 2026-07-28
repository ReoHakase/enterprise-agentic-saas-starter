import { expect } from "storybook/test"

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
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Issues" })).toBeVisible()
    await expect(
      canvas.getByRole("link", { name: "New issue" })
    ).toHaveAttribute("href", "/organization/acme/issues/new")

    const contentRoot = canvasElement.querySelector<HTMLElement>(
      "[data-storybook-content-root]"
    )
    await expect(contentRoot).not.toBeNull()
    if (!contentRoot) throw new Error("Storybook content root is missing")
    await expect(getComputedStyle(contentRoot).minHeight).toBe("256px")
  },
})

export const LoadingBoundary = meta.story({
  args: {
    boundaryState: "loading",
    actionHref: undefined,
    actionLabel: undefined,
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-boundary-state="loading"]')
    ).toHaveAttribute("aria-busy", "true")
  },
})

export const MobileLongCopy = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    title: "Organization security and tenant authorization",
    description:
      "Review every organization boundary before updating permissions or destructive settings.",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", {
        name: "Organization security and tenant authorization",
      })
    ).toBeVisible()
  },
})
