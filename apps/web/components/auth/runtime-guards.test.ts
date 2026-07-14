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

  it("normalizes form values and nested Better Auth errors without casts", () => {
    const formData = new FormData()
    formData.set("email", "user@example.test")

    expect(formDataString(formData, "email")).toBe("user@example.test")
    expect(formDataString(formData, "missing")).toBe("")
    expect(authErrorMessage({ error: { message: "Sign-in failed" } })).toBe(
      "Sign-in failed"
    )
  })
})
