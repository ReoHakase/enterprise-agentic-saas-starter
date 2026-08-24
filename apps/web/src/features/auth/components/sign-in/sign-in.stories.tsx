import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import { createDeferred } from "../../../../test-support/storybook/deferred"
import {
  authApiBaseUrl,
  authNavigate,
  AuthStoryScope,
  fictionalAuthUser,
} from "../../test-support/fixtures"
import { SignIn } from "./sign-in"

const credentials = {
  email: fictionalAuthUser.email,
  password: "correct-horse-battery-staple",
} as const

const fillCredentials = async (canvas: {
  getByRole: (role: "textbox", options: { name: string }) => HTMLElement
  getByLabelText: (name: string) => HTMLElement
}) => {
  await userEvent.type(
    canvas.getByRole("textbox", { name: "Email" }),
    credentials.email
  )
  await userEvent.type(canvas.getByLabelText("Password"), credentials.password)
}

const successResponse = {
  redirect: false,
  token: "storybook-session-token",
  user: fictionalAuthUser,
}

const meta = preview.meta({
  title: "Web/Auth/Sign In",
  component: SignIn,
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
    await step("キーボードでフォームへ入力する", async () => {
      await userEvent.tab()
      await expect(canvas.getByRole("textbox", { name: "Email" })).toHaveFocus()
      await fillCredentials(canvas)
      await expect(canvas.getByLabelText("Password")).toHaveValue(
        credentials.password
      )
    })
  },
})

export const InvalidInput = meta.story({
  play: async ({ canvas, step }) => {
    await step("形式不正の認証情報を拒否する", async () => {
      await userEvent.type(
        canvas.getByRole("textbox", { name: "Email" }),
        "not-an-email"
      )
      await userEvent.type(canvas.getByLabelText("Password"), "short")
      await userEvent.click(canvas.getByRole("button", { name: /^sign in$/i }))
      await expect(canvas.getByRole("textbox", { name: "Email" })).toBeInvalid()
      await expect(canvas.getByLabelText("Password")).toBeInvalid()
    })
  },
})

export const ApiFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-in/email`, () =>
        HttpResponse.json(
          {
            code: "INVALID_EMAIL_OR_PASSWORD",
            message: "Provider credential details must stay private.",
          },
          { status: 401 }
        )
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("固定の公開用エラーメッセージを表示する", async () => {
      await fillCredentials(canvas)
      await userEvent.click(canvas.getByRole("button", { name: /^sign in$/i }))
      await expect(
        await canvas.findByText("The email or password is incorrect.")
      ).toBeVisible()
      await expect(
        canvas.queryByText("Provider credential details must stay private.")
      ).not.toBeInTheDocument()
    })
  },
})

export const Success = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-in/email`, () =>
        HttpResponse.json(successResponse)
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("サインイン成功後に遷移する", async () => {
      await fillCredentials(canvas)
      await userEvent.click(canvas.getByRole("button", { name: /^sign in$/i }))
      await waitFor(() =>
        expect(authNavigate).toHaveBeenCalledWith({
          to: "/organization/acme/dashboard",
        })
      )
    })
  },
})

export const Submitting = meta.story({
  beforeEach({ msw }) {
    const responseGate = createDeferred<void>()
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-in/email`, async () => {
        await responseGate.promise
        return HttpResponse.json(successResponse)
      })
    )
    return () => responseGate.resolve(undefined)
  },
  play: async ({ canvas, step }) => {
    await step("リクエストの保留中にフォームを無効にする", async () => {
      await fillCredentials(canvas)
      const submit = canvas.getByRole("button", { name: /^sign in$/i })
      await userEvent.click(submit)
      await expect(submit).toBeDisabled()
      await expect(submit).toHaveAccessibleName("Loading Sign In")
      await expect(
        canvas.getByRole("textbox", { name: "Email" })
      ).toBeDisabled()
    })
  },
})

export const Reauthentication = meta.story({
  decorators: [
    (Story) => (
      <AuthStoryScope reauthenticating>
        <Story />
      </AuthStoryScope>
    ),
  ],
})
