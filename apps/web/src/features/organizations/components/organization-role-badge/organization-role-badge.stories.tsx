import { expect } from "storybook/test"

import preview from "#storybook/preview"

import { OrganizationRoleBadge } from "./organization-role-badge"

const meta = preview.meta({
  title: "Web/Organizations/Organization Role Badge",
  component: OrganizationRoleBadge,
  tags: ["autodocs"],
  args: { role: "member" },
})

export const SuperAdmin = meta.story({
  tags: ["theme-sensitive"],
  args: { role: "super_admin" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Super Admin")).toBeVisible()
    await expect(
      canvas.getByTestId("organization-role-super_admin")
    ).toBeVisible()
  },
})

export const Admin = meta.story({
  tags: ["theme-sensitive"],
  args: { role: "admin" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Admin")).toBeVisible()
    await expect(canvas.getByTestId("organization-role-admin")).toBeVisible()
  },
})

export const Member = meta.story({
  tags: ["theme-sensitive"],
  args: { role: "member" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Member")).toBeVisible()
    await expect(canvas.getByTestId("organization-role-member")).toBeVisible()
  },
})
