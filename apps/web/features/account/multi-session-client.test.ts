import { describe, expect, it, vi } from "vitest"

import {
  completeMultiSessionAction,
  createDeviceAccountsQueryFn,
  createMultiSessionCapabilities,
} from "./multi-session-client"

describe("multi-session client boundary", () => {
  it("supports Better Auth function/proxy-shaped clients", async () => {
    const listDeviceSessions = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({
        data: [
          {
            session: { token: "session-1" },
            user: {
              id: "user-1",
              name: "Reo",
              email: "reo@example.test",
              image: null,
            },
          },
        ],
      })
    const setActive = vi
      .fn<(input: { sessionToken: string }) => Promise<unknown>>()
      .mockResolvedValue({ data: {} })
    const authClient = Object.assign(() => undefined, {
      multiSession: { listDeviceSessions, setActive, revoke: setActive },
    })

    await expect(createDeviceAccountsQueryFn(authClient)()).resolves.toEqual([
      {
        session: { token: "session-1" },
        user: {
          id: "user-1",
          name: "Reo",
          email: "reo@example.test",
          profileImage: null,
        },
      },
    ])
    const capabilities = createMultiSessionCapabilities(authClient)
    expect(capabilities.setActive).toBeTypeOf("function")
    if (!capabilities.setActive)
      throw new Error("Expected setActive capability")
    await completeMultiSessionAction(
      capabilities.setActive({ sessionToken: "session-1" }),
      "Could not switch account"
    )
    expect(setActive).toHaveBeenCalledWith({ sessionToken: "session-1" })
  })

  it("validates account responses and hides provider error details", async () => {
    await expect(
      createDeviceAccountsQueryFn({
        multiSession: {
          listDeviceSessions: async () => ({
            data: [{ session: { token: 42 }, user: {} }],
          }),
        },
      })()
    ).rejects.toThrow("Invalid type")
    await expect(
      createDeviceAccountsQueryFn({
        multiSession: {
          listDeviceSessions: async () => ({
            error: { message: "private provider detail" },
          }),
        },
      })()
    ).rejects.toThrow("Accounts could not be loaded. Try again.")
    await expect(
      createDeviceAccountsQueryFn({
        multiSession: {
          listDeviceSessions: async () => {
            throw new Error("BETTER_AUTH_SECRET=provider-secret")
          },
        },
      })()
    ).rejects.toThrow("Accounts could not be loaded. Try again.")
    await expect(
      completeMultiSessionAction(
        Promise.reject(new Error("SELECT token FROM session")),
        "Could not switch account. Try again."
      )
    ).rejects.toThrow("Could not switch account. Try again.")
  })
})
