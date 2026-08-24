import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { createDeferred } from "../../../../test-support/storybook/deferred"
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
    await step("Tabキーでソーシャル サインインへフォーカスを移す", async () => {
      const button = canvas.getByRole("button", { name: "GitHub" })
      await userEvent.tab()
      await expect(button).toHaveFocus()
    })
  },
})

export const Pending = meta.story({
  beforeEach({ msw }) {
    const responseGate = createDeferred<void>()
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-in/social`, async () => {
        await responseGate.promise
        return HttpResponse.json({ url: "https://github.example.test/login" })
      })
    )
    return () => responseGate.resolve(undefined)
  },
  play: async ({ canvas, step }) => {
    await step(
      "プロバイダーのセットアップ中にソーシャル サインインを無効にする",
      async () => {
        const button = canvas.getByRole("button", { name: "GitHub" })
        await userEvent.click(button)
        await expect(button).toBeDisabled()
      }
    )
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
  play: async ({ canvas, canvasElement, step }) => {
    await step("失敗後にプロバイダー操作を再開可能にする", async () => {
      const button = canvas.getByRole("button", { name: "GitHub" })
      await userEvent.click(button)
      await expect(
        await within(canvasElement.ownerDocument.body).findByText(
          "GitHub sign-in could not be started. Try again."
        )
      ).toBeInTheDocument()
      await waitFor(() => expect(button).toBeEnabled())
    })
  },
})
