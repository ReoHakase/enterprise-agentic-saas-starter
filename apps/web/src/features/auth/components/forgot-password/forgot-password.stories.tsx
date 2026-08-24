import { http, HttpResponse } from "msw"
import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import {
  authApiBaseUrl,
  AuthStoryScope,
  fictionalAuthUser,
} from "../../test-support/fixtures"
import { ForgotPassword } from "./forgot-password"

const meta = preview.meta({
  title: "Web/Auth/Forgot Password",
  component: ForgotPassword,
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
    await step("復旧用の主要入力欄へフォーカスする", async () => {
      await userEvent.tab()
      await expect(canvas.getByRole("textbox", { name: "Email" })).toHaveFocus()
    })
  },
})

export const Sent = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/request-password-reset`, () =>
        HttpResponse.json({ status: true })
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("プライバシーを保つリセット受付を確認する", async () => {
      await userEvent.type(
        canvas.getByRole("textbox", { name: "Email" }),
        fictionalAuthUser.email
      )
      await userEvent.click(
        canvas.getByRole("button", { name: /send reset link/i })
      )
      await expect(await canvas.findByText("Check your email")).toBeVisible()
      await expect(canvas.getByText(fictionalAuthUser.email)).toBeVisible()
      await userEvent.click(
        canvas.getByRole("button", { name: /try another email/i })
      )
      await expect(canvas.getByRole("textbox", { name: "Email" })).toHaveValue(
        ""
      )
    })
  },
})

export const ApiFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/request-password-reset`, () =>
        HttpResponse.json({ message: "Provider failure." }, { status: 503 })
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("固定のリセット要求エラーを表示する", async () => {
      await userEvent.type(
        canvas.getByRole("textbox", { name: "Email" }),
        fictionalAuthUser.email
      )
      await userEvent.click(
        canvas.getByRole("button", { name: /send reset link/i })
      )
      await expect(
        await canvas.findByText(
          "We could not request a reset link. Check your email and try again."
        )
      ).toBeVisible()
    })
  },
})
