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

describe("authentication form schemas", () => {
  it("normalizes email input and rejects invalid credentials", () => {
    expect(
      v.parse(magicLinkFormSchema, { email: "  user@example.test  " })
    ).toEqual({ email: "user@example.test" })
    expect(
      v.safeParse(forgotPasswordFormSchema, { email: "invalid" }).success
    ).toBe(false)
    expect(
      v.safeParse(createSignInFormSchema(8, 128), {
        email: "user@example.test",
        password: "short",
        rememberMe: false,
      }).success
    ).toBe(false)
  })

  it("forwards password confirmation errors to the confirmation field", () => {
    const signUpResult = v.safeParse(
      createSignUpFormSchema({ ...passwordOptions, requireName: true }),
      {
        name: "Test User",
        email: "user@example.test",
        password: "correct-password",
        confirmPassword: "different-password",
      }
    )
    const resetResult = v.safeParse(
      createResetPasswordFormSchema(passwordOptions),
      {
        password: "correct-password",
        confirmPassword: "different-password",
      }
    )

    expect(signUpResult.success).toBe(false)
    expect(resetResult.success).toBe(false)
    const signUpMessages = signUpResult.success
      ? undefined
      : v.flatten(signUpResult.issues).nested?.confirmPassword
    const resetMessages = resetResult.success
      ? undefined
      : v.flatten(resetResult.issues).nested?.confirmPassword
    expect(signUpMessages).toContain("Passwords do not match.")
    expect(resetMessages).toContain("Passwords do not match.")
  })

  it("never exposes an unknown provider error message", () => {
    expect(
      safeAuthErrorMessage(
        { error: { code: "INTERNAL_ERROR", message: "database secret" } },
        "Try again safely."
      )
    ).toBe("Try again safely.")
    expect(
      safeAuthErrorMessage(
        { error: { code: "INVALID_EMAIL_OR_PASSWORD" } },
        "fallback"
      )
    ).toBe("The email or password is incorrect.")
  })
})
