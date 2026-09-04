import preview from "#storybook/preview"

import { OrganizationRoleBadge } from "./organization-role-badge"

const meta = preview.meta({
  title: "Web/Organizations/Organization Role Badge",
  component: OrganizationRoleBadge,
  tags: ["autodocs"],
  args: { role: "member" },
})

export const Owner = meta.story({
  tags: ["theme-sensitive"],
  args: { role: "owner" },
})

export const Admin = meta.story({
  tags: ["theme-sensitive"],
  args: { role: "admin" },
})

export const Member = meta.story({
  tags: ["theme-sensitive"],
  args: { role: "member" },
})
