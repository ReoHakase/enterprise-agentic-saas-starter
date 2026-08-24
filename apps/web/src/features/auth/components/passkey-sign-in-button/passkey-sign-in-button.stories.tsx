import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { AuthStoryScope } from "../../test-support/fixtures"
import { PasskeySignInButton } from "./passkey-sign-in-button"

const meta = preview.meta({
  title: "Web/Auth/Passkey Sign In",
  component: PasskeySignInButton,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AuthStoryScope>
        <Story />
      </AuthStoryScope>
    ),
  ],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("キーボードでパスキー サインインに到達する", async () => {
      await userEvent.tab()
      const button = canvas.getByRole("button", { name: /passkey/i })
      await expect(button).toHaveFocus()
    })
  },
})
