import { AlertTriangleIcon } from "lucide-react"
import { expect } from "storybook/test"

import preview from "#storybook/preview"

import { AppState, RouteLoading } from "./app-state"

const meta = preview.meta({
  title: "Web/Shared/App State",
  component: AppState,
  tags: ["autodocs"],
  args: {
    icon: AlertTriangleIcon,
    title: "No organization selected",
    description: "Choose a workspace to continue.",
    className: "min-h-80",
  },
})

export const Empty = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("region", { name: "No organization selected" })
    ).toBeVisible()
  },
})

export const IssuesLoading = meta.story({
  render: () => (
    <RouteLoading label="Loading issues" showAction variant="issues" />
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("status", { name: "Loading issues" })
    ).toHaveAttribute("aria-busy", "true")
  },
})

export const MobileLoading = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <RouteLoading label="Loading members" variant="members" />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("status", { name: "Loading members" })
    ).toBeVisible()
  },
})
