import { expect } from "storybook/test"

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
  play: async ({ canvasElement, step }) => {
    await step("Render the neutral organization fallback", async () => {
      const avatar = canvasElement.querySelector('[data-slot="avatar"]')
      await expect(avatar).toBeVisible()
      await expect(
        avatar?.querySelector(".lucide-building-2")
      ).toBeInTheDocument()
    })
  },
})

export const LongName = meta.story({
  args: {
    organization: {
      name: "International Reliability and Automation Platform",
      profileImage: null,
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-slot="avatar"]')
    ).toBeVisible()
  },
})
