import { http, HttpResponse } from "msw"
import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import {
  authApiBaseUrl,
  AuthStoryScope,
  fictionalAuthUser,
} from "../../test-support/fixtures"
import { MagicLink } from "./magic-link"

const meta = preview.meta({
  title: "Web/Auth/Magic Link",
  component: MagicLink,
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
    await step("送信前にメールを検証する", async () => {
      const email = canvas.getByRole("textbox", { name: "Email" })
      await userEvent.type(email, "invalid")
      await userEvent.click(
        canvas.getByRole("button", { name: /send magic link/i })
      )
      await expect(email).toBeInvalid()
    })
  },
})

export const Sent = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-in/magic-link`, () =>
        HttpResponse.json({ status: true })
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("決定的な送信確認を表示する", async () => {
      await userEvent.type(
        canvas.getByRole("textbox", { name: "Email" }),
        fictionalAuthUser.email
      )
      await userEvent.click(
        canvas.getByRole("button", { name: /send magic link/i })
      )
      await expect(
        await canvas.findByText(fictionalAuthUser.email, {
          selector: "strong",
        })
      ).toBeVisible()
      await expect(
        canvas.getByRole("button", { name: /use another email/i })
      ).toBeVisible()
    })
  },
})

export const ApiFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-in/magic-link`, () =>
        HttpResponse.json({ message: "Provider unavailable." }, { status: 503 })
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("公開用のリクエスト失敗を表示する", async () => {
      await userEvent.type(
        canvas.getByRole("textbox", { name: "Email" }),
        fictionalAuthUser.email
      )
      await userEvent.click(
        canvas.getByRole("button", { name: /send magic link/i })
      )
      await expect(
        await canvas.findByText(
          "We could not send the sign-in link. Check your email and try again."
        )
      ).toBeVisible()
    })
  },
})
