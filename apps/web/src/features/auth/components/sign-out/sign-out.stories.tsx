import { http, HttpResponse } from "msw"
import { expect, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import {
  authApiBaseUrl,
  authNavigate,
  AuthStoryScope,
} from "../../test-support/fixtures"
import { SignOut } from "./sign-out"

const meta = preview.meta({
  title: "Web/Auth/Sign Out",
  component: SignOut,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AuthStoryScope>
        <Story />
      </AuthStoryScope>
    ),
  ],
})

export const SigningOut = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(
      http.post(
        `${authApiBaseUrl}/auth/sign-out`,
        () => new HttpResponse(null, { status: 204 })
      )
    )
  },
  play: async ({ step }) => {
    await step("認証状態をクリアした後にサインインに戻る", async () => {
      await waitFor(() =>
        expect(authNavigate).toHaveBeenCalledWith({
          to: "/auth/sign-in",
          replace: true,
        })
      )
    })
  },
})
