import { describe, expect, it, vi } from "vitest"

import {
  completeSecurityMutation,
  createSecurityAuthCapabilities,
  hasSecurityMethodsCapability,
  loadSecurityMethods,
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

  it("rejects malformed provider data and provider errors", async () => {
    await expect(
      loadSecurityMethods({
        listAccounts: async () => ({ data: [{ providerId: 42 }] }),
      })
    ).rejects.toThrow("Invalid type")
    await expect(
      completeSecurityMutation(
        Promise.resolve({
          error: { message: "TURSO_AUTH_TOKEN=provider-secret" },
        })
      )
    ).rejects.toThrow("Authentication request failed")
    await expect(
      completeSecurityMutation(
        Promise.resolve({
          error: {
            code: "SESSION_NOT_FRESH",
            message: "SELECT token FROM session WHERE secret = 'private'",
          },
        })
      )
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FRESH",
      message: "Sign in again to continue.",
    })
    await expect(
      completeSecurityMutation(
        Promise.reject(new Error("SELECT token FROM account"))
      )
    ).rejects.toThrow("Authentication request failed")
    await expect(
      loadSecurityMethods({
        listAccounts: async () => {
          throw new Error("DATABASE_URL=file:private.db")
        },
      })
    ).rejects.toThrow("Authentication request failed")
  })

  it("reports unavailable clients without inventing capabilities", () => {
    const capabilities = createSecurityAuthCapabilities(undefined)
    expect(hasSecurityMethodsCapability(capabilities)).toBe(false)
  })
})
