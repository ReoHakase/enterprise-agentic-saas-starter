import type { Meta, StoryObj } from "@storybook/react-vite"

import { ProfileImageEditor } from "./profile-image-editor"

const meta = {
  title: "Web/Profile Images/Profile Image Editor",
  component: ProfileImageEditor,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ProfileImageEditor>

export default meta
type Story = StoryObj<typeof meta>

export const UserWithoutImage: Story = {
  args: {
    subject: "user",
    name: "Avery Stone",
    profileImage: null,
  },
}

export const OrganizationWithoutImage: Story = {
  args: {
    subject: "organization",
    organizationId: "org-1",
    name: "Acme Cloud",
    profileImage: null,
  },
}
