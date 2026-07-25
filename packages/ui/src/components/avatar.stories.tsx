import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "./avatar"

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs", "theme-sensitive"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

export const UserProfileImage: Story = {
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
}

export const OrganizationProfileImage: Story = {
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
}

export const PresenceGroup: Story = {
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
}
