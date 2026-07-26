import { delay, http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { authApiBaseUrl, AuthStoryScope } from "../../test-support/fixtures"
import { ProviderButtons } from "./provider-buttons"

const meta = preview.meta({
  title: "Web/Auth/Provider Buttons",
  component: ProviderButtons,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AuthStoryScope>
        <Story />
      </AuthStoryScope>
    ),
  ],
})

export const Vertical = meta.story({
  tags: ["theme-sensitive"],
  args: { socialLayout: "vertical" },
  play: async ({ canvas, step }) => {
    await step(
      "Expose the configured provider by accessible name",
      async () => {
        const button = canvas.getByRole("button", { name: "GitHub" })
        await userEvent.tab()
        await expect(button).toHaveFocus()
        await expect(button).toHaveTextContent("Continue with GitHub")
      }
    )
  },
})

export const Pending = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-in/social`, async () => {
        await delay("infinite")
        return HttpResponse.json({ url: "https://github.example.test/login" })
      })
    )
  },
  play: async ({ canvas, step }) => {
    await step("Disable social sign-in during provider setup", async () => {
      const button = canvas.getByRole("button", { name: "GitHub" })
      await userEvent.click(button)
      await expect(button).toBeDisabled()
    })
  },
})

export const ApiFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-in/social`, () =>
        HttpResponse.json({ message: "Provider unavailable." }, { status: 503 })
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("Restore the provider action after a failure", async () => {
      const button = canvas.getByRole("button", { name: "GitHub" })
      await userEvent.click(button)
      await expect(
        await within(document.body).findByText(
          "GitHub sign-in could not be started. Try again."
        )
      ).toBeInTheDocument()
      await waitFor(() => expect(button).toBeEnabled())
    })
  },
})
