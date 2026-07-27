import { expect } from "storybook/test"

import preview from "#storybook/preview"

import { InvitationStatusBadge } from "./invitation-status-badge"

const meta = preview.meta({
  title: "Web/Members/Invitation Status Badge",
  component: InvitationStatusBadge,
  tags: ["autodocs"],
  args: { status: "pending" },
})

export const Pending = meta.story({
  tags: ["theme-sensitive"],
  args: { status: "pending" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Pending")).toBeVisible()
    await expect(canvas.getByTestId("invitation-status-pending")).toBeVisible()
  },
})

export const Accepted = meta.story({
  tags: ["theme-sensitive"],
  args: { status: "accepted" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Accepted")).toBeVisible()
    await expect(canvas.getByTestId("invitation-status-accepted")).toBeVisible()
  },
})

export const Rejected = meta.story({
  tags: ["theme-sensitive"],
  args: { status: "rejected" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Rejected")).toBeVisible()
    await expect(canvas.getByTestId("invitation-status-rejected")).toBeVisible()
  },
})

export const Expired = meta.story({
  tags: ["theme-sensitive"],
  args: { status: "expired" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Expired")).toBeVisible()
    await expect(canvas.getByTestId("invitation-status-expired")).toBeVisible()
  },
})

export const Canceled = meta.story({
  tags: ["theme-sensitive"],
  args: { status: "canceled" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Canceled")).toBeVisible()
    await expect(canvas.getByTestId("invitation-status-canceled")).toBeVisible()
  },
})
