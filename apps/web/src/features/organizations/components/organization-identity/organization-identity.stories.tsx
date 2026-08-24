import preview from "#storybook/preview"

import { OrganizationProfileImage } from "./organization-identity"

const meta = preview.meta({
  title: "Web/Organizations/Organization Identity",
  component: OrganizationProfileImage,
  tags: ["autodocs"],
  args: {
    organization: {
      name: "Acme Cloud",
      profileImage: null,
    },
  },
})

export const Fallback = meta.story({
  tags: ["theme-sensitive"],
})

export const LongName = meta.story({
  args: {
    organization: {
      name: "International Reliability and Automation Platform",
      profileImage: null,
    },
  },
})
