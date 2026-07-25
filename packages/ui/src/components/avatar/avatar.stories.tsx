import { expect } from "storybook/test"

import preview from "#storybook/preview"

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "./avatar"

const meta = preview.meta({
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs", "theme-sensitive"],
  parameters: { layout: "centered" },
})

export const UserProfileImage = meta.story({
  args: {
    shape: "circle",
    children: <AvatarFallback>RH</AvatarFallback>,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("RH").parentElement).toHaveAttribute(
      "data-shape",
      "circle"
    )
  },
})

export const OrganizationProfileImage = meta.story({
  args: {
    shape: "rounded",
    children: <AvatarFallback>AC</AvatarFallback>,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("AC").parentElement).toHaveAttribute(
      "data-shape",
      "rounded"
    )
  },
})

export const PresenceGroup = meta.story({
  render: () => (
    <AvatarGroup aria-label="Active collaborators">
      <Avatar>
        <AvatarImage
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23d4d4d8'/%3E%3C/svg%3E"
          alt="Avery Stone"
        />
        <AvatarFallback>AS</AvatarFallback>
        <AvatarBadge role="status" aria-label="Online" />
      </Avatar>
      <Avatar>
        <AvatarFallback>JL</AvatarFallback>
      </Avatar>
      <AvatarGroupCount
        className="text-foreground"
        aria-label="3 more collaborators"
      >
        +3
      </AvatarGroupCount>
    </AvatarGroup>
  ),
})
