import { describe, expect, it, vi } from "vitest"

import {
  completeSecurityMutation,
  createSecurityAuthCapabilities,
  hasSecurityMethodsCapability,
  loadSecurityMethods,
  securityMutationErrorMessage,
} from "./security-client"

describe("security auth client boundary", () => {
  it("binds Better Auth capabilities and validates returned models", async () => {
    const authClient = {
      listAccounts: vi.fn<() => Promise<unknown>>().mockResolvedValue({
        data: [
          {
            id: "account-1",
            providerId: "github",
            createdAt: "2026-07-14T00:00:00.000Z",
          },
        ],
      }),
      passkey: {
        listUserPasskeys: vi.fn<() => Promise<unknown>>().mockResolvedValue({
          data: [{ id: "passkey-1", name: "MacBook" }],
        }),
      },
    }

    const capabilities = createSecurityAuthCapabilities(authClient)
    expect(hasSecurityMethodsCapability(capabilities)).toBe(true)
    await expect(loadSecurityMethods(capabilities)).resolves.toEqual({
      accounts: [
        {
          id: "account-1",
          providerId: "github",
          createdAt: "2026-07-14T00:00:00.000Z",
        },
      ],
      passkeys: [{ id: "passkey-1", name: "MacBook" }],
    })
    expect(authClient.listAccounts).toHaveBeenCalledOnce()
    expect(authClient.passkey.listUserPasskeys).toHaveBeenCalledOnce()
  })

  it("rejects malformed provider data and preserves provider errors", async () => {
    await expect(
      loadSecurityMethods({
        listAccounts: async () => ({ data: [{ providerId: 42 }] }),
      })
    ).rejects.toThrow("Invalid type")
    const returnedError = { message: "TURSO_AUTH_TOKEN=provider-secret" }
    await expect(
      completeSecurityMutation(Promise.resolve({ error: returnedError }))
    ).rejects.toBe(returnedError)
    const sessionError = {
      code: "SESSION_NOT_FRESH",
      message: "SELECT token FROM session WHERE secret = 'private'",
    }
    await expect(
      completeSecurityMutation(Promise.resolve({ error: sessionError }))
    ).rejects.toBe(sessionError)
    const rejectedError = new Error("SELECT token FROM account")
    await expect(
      completeSecurityMutation(Promise.reject(rejectedError))
    ).rejects.toBe(rejectedError)
    const loadError = new Error("DATABASE_URL=file:private.db")
    await expect(
      loadSecurityMethods({
        listAccounts: async () => {
          throw loadError
        },
      })
    ).rejects.toBe(loadError)
  })

  it("reports unavailable clients without inventing capabilities", () => {
    const capabilities = createSecurityAuthCapabilities(undefined)
    expect(hasSecurityMethodsCapability(capabilities)).toBe(false)
  })

  it("maps allowlisted Better Auth codes without exposing provider messages", () => {
    expect(
      securityMutationErrorMessage(
        {
          code: "ERROR_CEREMONY_ABORTED",
          message: "credential=private-provider-material",
        },
        "Fallback"
      )
    ).toBe("Passkey registration was cancelled.")
    expect(
      securityMutationErrorMessage(
        { code: "UNKNOWN", message: "token=private-provider-material" },
        "Fallback"
      )
    ).toBe("Fallback")
  })
})
