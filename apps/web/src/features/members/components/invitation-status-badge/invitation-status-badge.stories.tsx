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
})

export const Accepted = meta.story({
  tags: ["theme-sensitive"],
  args: { status: "accepted" },
})

export const Rejected = meta.story({
  tags: ["theme-sensitive"],
  args: { status: "rejected" },
})

export const Expired = meta.story({
  tags: ["theme-sensitive"],
  args: { status: "expired" },
})

export const Canceled = meta.story({
  tags: ["theme-sensitive"],
  args: { status: "canceled" },
})
