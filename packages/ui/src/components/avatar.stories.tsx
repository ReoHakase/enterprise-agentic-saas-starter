import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { Avatar, AvatarFallback } from "./avatar"

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs"],
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
