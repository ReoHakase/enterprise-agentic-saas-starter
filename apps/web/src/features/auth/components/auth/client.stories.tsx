import { expect } from "storybook/test"

import preview from "#storybook/preview"

import { AuthStoryScope } from "../../test-support/fixtures"
import { Auth } from "./client"

const meta = preview.meta({
  title: "Web/Auth/Routed View",
  component: Auth,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AuthStoryScope>
        <Story />
      </AuthStoryScope>
    ),
  ],
})

export const SignInRoute = meta.story({
  tags: ["theme-sensitive"],
  args: { view: "signIn" },
  play: async ({ canvas, step }) => {
    await step("Render the selected authentication view", async () => {
      await expect(
        canvas.getByText("Sign In", { selector: "[data-slot=card-title]" })
      ).toBeVisible()
    })
  },
})

export const Reauthentication = meta.story({
  args: { view: "signIn" },
  decorators: [
    (Story) => (
      <AuthStoryScope reauthenticating>
        <Story />
      </AuthStoryScope>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Sign In", { selector: "[data-slot=card-title]" })
    ).toBeVisible()
  },
})
