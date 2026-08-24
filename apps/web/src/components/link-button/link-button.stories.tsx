import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { LinkButton } from "./link-button"

const meta = preview.meta({
  title: "Web/Shared/Link Button",
  component: LinkButton,
  tags: ["autodocs"],
  args: {
    href: "/settings/account",
    children: "Open account settings",
  },
})

export const Primary = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("Tabキーでアカウント設定リンクへフォーカスを移す", async () => {
      const link = canvas.getByRole("link", { name: "Open account settings" })
      await userEvent.tab()
      await expect(link).toHaveFocus()
    })
  },
})

export const Destructive = meta.story({
  args: {
    href: "/settings/organizations",
    children: "Review deletion settings",
    variant: "destructive",
  },
})
