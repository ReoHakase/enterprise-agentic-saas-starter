import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { describe, expect, it } from "vitest"

import {
  authErrorMessage,
  formDataString,
  requireMagicLinkAuthClient,
  requirePasskeyAuthClient,
} from "./runtime-guards"

describe("authentication runtime guards", () => {
  it("accepts the Better Auth proxy client with configured plugins", () => {
    const client = createAuthClientForBaseUrl("http://localhost:3001")

    expect(requireMagicLinkAuthClient(client)).toBe(client)
    expect(requirePasskeyAuthClient(client)).toBe(client)
  })

  it("rejects clients that do not expose the required plugin method", () => {
    expect(() => requireMagicLinkAuthClient({ signIn: {} })).toThrow(
      "Magic link authentication is not configured"
    )
    expect(() => requirePasskeyAuthClient({ signIn: {} })).toThrow(
      "Passkey authentication is not configured"
    )
  })

  it("normalizes form values and only exposes allowlisted auth codes", () => {
    const formData = new FormData()
    formData.set("email", "user@example.test")

    expect(formDataString(formData, "email")).toBe("user@example.test")
    expect(formDataString(formData, "missing")).toBe("")
    expect(
      authErrorMessage(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "TURSO_AUTH_TOKEN=provider-secret",
          },
        },
        "Sign-in failed safely"
      )
    ).toBe("Sign-in failed safely")
    expect(
      authErrorMessage({ code: "SESSION_EXPIRED" }, "Sign-in failed safely")
    ).toBe("Your session expired. Sign in again.")
    expect(
      authErrorMessage(
        { error: { message: "Sign-in failed" } },
        "Sign-in failed safely"
      )
    ).toBe("Sign-in failed safely")
  })

  it("falls back when an error object has an unsafe accessor", () => {
    const error = Object.create(null, {
      error: {
        get: () => {
          throw new Error("DATABASE_URL=file:private.db")
        },
      },
    })

    expect(authErrorMessage(error, "Request failed safely")).toBe(
      "Request failed safely"
    )
  })
})
