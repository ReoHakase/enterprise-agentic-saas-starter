import type { AdditionalField } from "@better-auth-ui/core"
import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import {
  authApiBaseUrl,
  authNavigate,
  AuthStoryScope,
  departmentField,
  fictionalAuthUser,
} from "../../test-support/fixtures"
import { SignUp } from "./sign-up"

const password = "correct-horse-battery-staple"
const additionalFields = [
  { ...departmentField, signUp: true },
] satisfies AdditionalField[]

const fillAccount = async (canvas: {
  getByRole: (role: "textbox", options: { name: string }) => HTMLElement
  getByLabelText: (name: string) => HTMLElement
}) => {
  await userEvent.type(
    canvas.getByRole("textbox", { name: "Name" }),
    fictionalAuthUser.name
  )
  await userEvent.type(
    canvas.getByRole("textbox", { name: "Email" }),
    fictionalAuthUser.email
  )
  await userEvent.type(canvas.getByLabelText("Password"), password)
  await userEvent.type(canvas.getByLabelText("Confirm password"), password)
}

const meta = preview.meta({
  title: "Web/Auth/Sign Up",
  component: SignUp,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AuthStoryScope additionalFields={additionalFields}>
        <Story />
      </AuthStoryScope>
    ),
  ],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("アカウント情報を入力する", async () => {
      await fillAccount(canvas)
      await expect(
        canvas.getByRole("combobox", { name: "Department" })
      ).toHaveTextContent("Engineering")
      await expect(
        canvas.getByRole("button", { name: /^sign up$/i })
      ).toBeEnabled()
    })
  },
})

export const ApiFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-up/email`, () =>
        HttpResponse.json(
          { code: "USER_ALREADY_EXISTS", message: "Private provider detail." },
          { status: 409 }
        )
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("プロバイダー障害を固定メッセージへ変換する", async () => {
      await fillAccount(canvas)
      await userEvent.click(canvas.getByRole("button", { name: /^sign up$/i }))
      await expect(
        await canvas.findByText(
          "An account already exists for this email address."
        )
      ).toBeVisible()
      await expect(
        canvas.queryByText("Private provider detail.")
      ).not.toBeInTheDocument()
    })
  },
})

export const Success = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.post(`${authApiBaseUrl}/auth/sign-up/email`, () =>
        HttpResponse.json({
          redirect: false,
          token: "storybook-session-token",
          user: fictionalAuthUser,
        })
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("組織のワークスペースに移動する", async () => {
      await fillAccount(canvas)
      await userEvent.click(canvas.getByRole("button", { name: /^sign up$/i }))
      await waitFor(() =>
        expect(authNavigate).toHaveBeenCalledWith({
          to: "/organization/acme/dashboard",
        })
      )
    })
  },
})
