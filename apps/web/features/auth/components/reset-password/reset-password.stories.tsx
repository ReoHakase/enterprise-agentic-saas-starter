import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import {
  authApiBaseUrl,
  authNavigate,
  AuthStoryScope,
} from "../../test-support/fixtures"
import { ResetPassword } from "./reset-password"

const password = "new-correct-horse-battery-staple"

const withToken = () => {
  window.history.replaceState({}, "", "?token=reset-token-storybook")
  return () => window.history.replaceState({}, "", window.location.pathname)
}

const meta = preview.meta({
  title: "Web/Auth/Reset Password",
  component: ResetPassword,
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
  beforeEach: withToken,
  play: async ({ canvas, step }) => {
    await step("Reject mismatched new passwords", async () => {
      await userEvent.type(canvas.getByLabelText("Password"), password)
      await userEvent.type(
        canvas.getByLabelText("Confirm password"),
        "not-the-same-password"
      )
      await userEvent.click(
        canvas.getByRole("button", { name: /reset password/i })
      )
      await expect(canvas.getByLabelText("Confirm password")).toBeInvalid()
    })
  },
})

export const MissingToken = meta.story({
  beforeEach() {
    window.history.replaceState({}, "", window.location.pathname)
  },
  play: async ({ step }) => {
    await step("Return to sign-in when the reset token is absent", async () => {
      await waitFor(() =>
        expect(authNavigate).toHaveBeenCalledWith({ to: "/auth/sign-in" })
      )
    })
  },
})

export const Success = meta.story({
  beforeEach(context) {
    const restore = withToken()
    context.msw.use(
      http.post(`${authApiBaseUrl}/auth/reset-password`, () =>
        HttpResponse.json({ status: true })
      )
    )
    return restore
  },
  play: async ({ canvas, step }) => {
    await step("Submit a valid reset token and password", async () => {
      await userEvent.type(canvas.getByLabelText("Password"), password)
      await userEvent.type(canvas.getByLabelText("Confirm password"), password)
      await userEvent.click(
        canvas.getByRole("button", { name: /reset password/i })
      )
      await waitFor(() =>
        expect(authNavigate).toHaveBeenCalledWith({ to: "/auth/sign-in" })
      )
    })
  },
})
