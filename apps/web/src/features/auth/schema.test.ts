import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { safeAuthErrorMessage } from "./error"
import {
  createResetPasswordFormSchema,
  createSignInFormSchema,
  createSignUpFormSchema,
  forgotPasswordFormSchema,
  magicLinkFormSchema,
} from "./schema"

const passwordOptions = {
  confirmPassword: true,
  minimumPasswordLength: 8,
  maximumPasswordLength: 128,
  passwordsDoNotMatchMessage: "Passwords do not match.",
}

describe("認証フォームのスキーマ", () => {
  it("マジックリンクのメールアドレス前後を除去する", () => {
    expect(
      v.parse(magicLinkFormSchema, { email: "  user@example.test  " })
    ).toEqual({ email: "user@example.test" })
  })

  it("パスワード再設定では不正なメールアドレスを拒否する", () => {
    expect(
      v.safeParse(forgotPasswordFormSchema, { email: "invalid" }).success
    ).toBe(false)
  })

  it("サインインでは最小文字数未満のパスワードを拒否する", () => {
    expect(
      v.safeParse(createSignInFormSchema(8, 128), {
        email: "user@example.test",
        password: "short",
        rememberMe: false,
      }).success
    ).toBe(false)
  })

  it("サインアップのパスワード不一致を確認用フィールドへ割り当てる", () => {
    const signUpResult = v.safeParse(
      createSignUpFormSchema({ ...passwordOptions, requireName: true }),
      {
        name: "Test User",
        email: "user@example.test",
        password: "correct-password",
        confirmPassword: "different-password",
      }
    )

    expect(signUpResult.success).toBe(false)
    const signUpMessages = signUpResult.success
      ? undefined
      : v.flatten(signUpResult.issues).nested?.confirmPassword
    expect(signUpMessages).toContain("Passwords do not match.")
  })

  it("パスワード再設定の不一致を確認用フィールドへ割り当てる", () => {
    const resetResult = v.safeParse(
      createResetPasswordFormSchema(passwordOptions),
      {
        password: "correct-password",
        confirmPassword: "different-password",
      }
    )

    expect(resetResult.success).toBe(false)
    const resetMessages = resetResult.success
      ? undefined
      : v.flatten(resetResult.issues).nested?.confirmPassword
    expect(resetMessages).toContain("Passwords do not match.")
  })

  it.each([
    {
      caseLabel: "未知の内部エラー",
      input: { error: { code: "INTERNAL_ERROR", message: "database secret" } },
      fallback: "Try again safely.",
      expected: "Try again safely.",
    },
    {
      caseLabel: "認証情報の不一致",
      input: { error: { code: "INVALID_EMAIL_OR_PASSWORD" } },
      fallback: "fallback",
      expected: "The email or password is incorrect.",
    },
    {
      caseLabel: "存在しない招待",
      input: {
        code: "INVITATION_NOT_FOUND",
        message: "SELECT token FROM invitation",
      },
      fallback: "fallback",
      expected: "This invitation is no longer available.",
    },
    {
      caseLabel: "小文字表記の内部エラー",
      input: {
        error: {
          code: "internal_error",
          message: "BETTER_AUTH_SECRET=do-not-render",
        },
      },
      fallback: "Operation failed safely.",
      expected: "Operation failed safely.",
    },
    {
      caseLabel: "キャンセルされたパスキー登録",
      input: {
        error: {
          code: "ERROR_CEREMONY_ABORTED",
          message: "raw WebAuthn error",
        },
      },
      fallback: "fallback",
      expected: "Passkey registration was cancelled.",
    },
    {
      caseLabel: "登録済みのパスキー",
      input: {
        error: {
          code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
          message: "raw authenticator metadata",
        },
      },
      fallback: "fallback",
      expected: "That passkey is already registered.",
    },
    {
      caseLabel: "送信済みの組織招待",
      input: {
        status: 400,
        error: {
          code: "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
          message: "provider-owned invitation detail",
        },
      },
      fallback: "fallback",
      expected: "An invitation is already pending for this email address.",
    },
  ])(
    "$caseLabelでは安全な認証エラー文言を返す",
    ({ expected, fallback, input }) => {
      expect(safeAuthErrorMessage(input, fallback)).toBe(expected)
    }
  )
})
