import { QueryClient } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  removeDeviceAccount,
  signOutCurrentDeviceAccount,
  switchDeviceAccount,
} from "./device-account-actions"
import type { DeviceAccount } from "./schema"

const currentAccount = {
  session: { token: "session-current" },
  user: {
    id: "user-current",
    name: "Current User",
    email: "current@example.test",
    profileImage: null,
  },
} satisfies DeviceAccount

const otherAccount = {
  session: { token: "session-other" },
  user: {
    id: "user-other",
    name: "Other User",
    email: "other@example.test",
    profileImage: null,
  },
} satisfies DeviceAccount

const freshCapabilities = ({
  accounts = [currentAccount, otherAccount],
  current = currentAccount,
  revoke,
  setActive,
}: {
  accounts?: DeviceAccount[]
  current?: DeviceAccount
  revoke?: (input: { sessionToken: string }) => Promise<unknown>
  setActive?: (input: { sessionToken: string }) => Promise<unknown>
}) => ({
  getSession: async () => ({
    data: {
      session: { token: current.session.token },
      user: { id: current.user.id },
    },
  }),
  listDeviceSessions: async () => ({
    data: accounts.map((account) => ({
      session: account.session,
      user: {
        id: account.user.id,
        name: account.user.name,
        email: account.user.email,
        image: account.user.profileImage,
      },
    })),
  }),
  revoke,
  setActive,
})

describe("device account actions", () => {
  const fetchAgent = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchAgent.mockResolvedValue(Response.json({ contextEpoch: 2 }))
    vi.stubGlobal("fetch", fetchAgent)
  })

  afterEach(() => vi.unstubAllGlobals())

  it("switches only after revoking and fencing the old identity", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["private"], "old account")
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries")
    const clear = vi.spyOn(queryClient, "clear")
    const abort = vi.fn<() => void>()
    const complete = vi.fn<() => Promise<void>>().mockResolvedValue()
    const setActive =
      vi.fn<(input: { sessionToken: string }) => Promise<unknown>>()
    setActive.mockResolvedValue({ data: {} })

    await switchDeviceAccount({
      account: otherAccount,
      accounts: [currentAccount, otherAccount],
      currentUserId: currentAccount.user.id,
      lifecycle: { onAbort: abort, onComplete: complete },
      multiSession: freshCapabilities({ setActive }),
      queryClient,
    })

    expect(fetchAgent).toHaveBeenCalledOnce()
    expect(fetchAgent.mock.invocationCallOrder[0]).toBeLessThan(
      abort.mock.invocationCallOrder[0] ?? 0
    )
    expect(abort.mock.invocationCallOrder[0]).toBeLessThan(
      cancelQueries.mock.invocationCallOrder[0] ?? 0
    )
    expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      setActive.mock.invocationCallOrder[0] ?? 0
    )
    expect(setActive.mock.invocationCallOrder[0]).toBeLessThan(
      complete.mock.invocationCallOrder[0] ?? 0
    )
    expect(complete.mock.invocationCallOrder[0]).toBeLessThan(
      clear.mock.invocationCallOrder[0] ?? 0
    )
    expect(queryClient.getQueryData(["private"])).toBeUndefined()
  })

  it("signs out only the uniquely resolved current session", async () => {
    const queryClient = new QueryClient()
    const revoke =
      vi.fn<(input: { sessionToken: string }) => Promise<unknown>>()
    revoke.mockResolvedValue({ data: {} })

    await signOutCurrentDeviceAccount({
      accounts: [currentAccount, otherAccount],
      currentUserId: currentAccount.user.id,
      lifecycle: {},
      multiSession: freshCapabilities({ revoke }),
      queryClient,
    })

    expect(revoke).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith({
      sessionToken: currentAccount.session.token,
    })
  })

  it("fails closed when the current session token is ambiguous", async () => {
    const queryClient = new QueryClient()
    const revoke =
      vi.fn<(input: { sessionToken: string }) => Promise<unknown>>()
    revoke.mockResolvedValue({ data: {} })
    const duplicateCurrent = {
      ...currentAccount,
      session: { token: "session-current-duplicate" },
    }

    await expect(
      signOutCurrentDeviceAccount({
        accounts: [currentAccount, duplicateCurrent, otherAccount],
        currentUserId: currentAccount.user.id,
        lifecycle: {},
        multiSession: freshCapabilities({ revoke }),
        queryClient,
      })
    ).rejects.toThrow("Account state changed. Reload and try again.")

    expect(fetchAgent).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })

  it("does not clear identity state when removing a non-current account", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["private"], "current account")
    const revoke =
      vi.fn<(input: { sessionToken: string }) => Promise<unknown>>()
    revoke.mockResolvedValue({ data: {} })

    await removeDeviceAccount({
      account: otherAccount,
      accounts: [currentAccount, otherAccount],
      currentUserId: currentAccount.user.id,
      multiSession: freshCapabilities({ revoke }),
    })

    expect(revoke).toHaveBeenCalledWith({
      sessionToken: otherAccount.session.token,
    })
    expect(fetchAgent).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(["private"])).toBe("current account")
  })

  it("leaves the old account cache intact when activation fails", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["private"], "old account")
    const complete = vi.fn<() => Promise<void>>().mockResolvedValue()
    const setActive =
      vi.fn<(input: { sessionToken: string }) => Promise<unknown>>()
    const providerError = new Error("provider detail")
    setActive.mockRejectedValue(providerError)

    await expect(
      switchDeviceAccount({
        account: otherAccount,
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        lifecycle: { onComplete: complete },
        multiSession: freshCapabilities({ setActive }),
        queryClient,
      })
    ).rejects.toBe(providerError)

    expect(complete).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(["private"])).toBe("old account")
  })

  it("rejects sign-out before Agent revoke when another tab changed the active session", async () => {
    const queryClient = new QueryClient()
    const revoke =
      vi.fn<(input: { sessionToken: string }) => Promise<unknown>>()

    await expect(
      signOutCurrentDeviceAccount({
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        lifecycle: {},
        multiSession: freshCapabilities({
          current: otherAccount,
          revoke,
        }),
        queryClient,
      })
    ).rejects.toThrow("Account state changed. Reload and try again.")

    expect(fetchAgent).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })

  it("never removes an account that became current in another tab", async () => {
    const revoke =
      vi.fn<(input: { sessionToken: string }) => Promise<unknown>>()

    await expect(
      removeDeviceAccount({
        account: otherAccount,
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        multiSession: freshCapabilities({
          current: otherAccount,
          revoke,
        }),
      })
    ).rejects.toThrow("Account state changed. Reload and try again.")

    expect(fetchAgent).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })

  it("reports an identity change when the active token changes during removal", async () => {
    const revoke =
      vi.fn<(input: { sessionToken: string }) => Promise<unknown>>()
    revoke.mockResolvedValue({ data: {} })
    const capabilities = freshCapabilities({ revoke })
    const getSession = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({
        data: {
          session: { token: currentAccount.session.token },
          user: { id: currentAccount.user.id },
        },
      })
      .mockResolvedValueOnce({
        data: {
          session: { token: otherAccount.session.token },
          user: { id: otherAccount.user.id },
        },
      })

    await expect(
      removeDeviceAccount({
        account: otherAccount,
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        multiSession: { ...capabilities, getSession },
      })
    ).resolves.toBe(true)

    expect(revoke).toHaveBeenCalledOnce()
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it("rejects a stale switch target before revoking the old Agent context", async () => {
    const queryClient = new QueryClient()
    const setActive =
      vi.fn<(input: { sessionToken: string }) => Promise<unknown>>()

    await expect(
      switchDeviceAccount({
        account: otherAccount,
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        lifecycle: {},
        multiSession: freshCapabilities({
          accounts: [currentAccount],
          setActive,
        }),
        queryClient,
      })
    ).rejects.toThrow("Account state changed. Reload and try again.")

    expect(fetchAgent).not.toHaveBeenCalled()
    expect(setActive).not.toHaveBeenCalled()
  })
})
