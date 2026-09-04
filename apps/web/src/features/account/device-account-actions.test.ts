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

type SessionMutationInput = {
  sessionToken: string
  fetchOptions?: { throw?: boolean }
}

const unavailableSessionMutation = async (_input: SessionMutationInput) => {
  throw new Error("Unexpected multi-session mutation")
}

const freshAuthClient = ({
  accounts = [currentAccount, otherAccount],
  current = currentAccount,
  revoke,
  setActive,
}: {
  accounts?: DeviceAccount[]
  current?: DeviceAccount
  revoke?: (input: SessionMutationInput) => Promise<unknown>
  setActive?: (input: SessionMutationInput) => Promise<unknown>
}) => ({
  getSession: async () => ({
    session: { token: current.session.token },
    user: { id: current.user.id },
  }),
  multiSession: {
    listDeviceSessions: async () =>
      accounts.map((account) => ({
        session: account.session,
        user: {
          id: account.user.id,
          name: account.user.name,
          email: account.user.email,
          image: account.user.profileImage,
        },
      })),
    revoke: revoke ?? unavailableSessionMutation,
    setActive: setActive ?? unavailableSessionMutation,
  },
})

describe("デバイスアカウントのアクション", () => {
  const fetchAgent = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchAgent.mockResolvedValue(Response.json({ contextEpoch: 2 }))
    vi.stubGlobal("fetch", fetchAgent)
  })

  afterEach(() => vi.unstubAllGlobals())

  it("古い認証状態を取り消し、競合を防いでから切り替える", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["private"], "old account")
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries")
    const clear = vi.spyOn(queryClient, "clear")
    const abort = vi.fn<() => void>()
    const complete = vi.fn<() => Promise<void>>().mockResolvedValue()
    const setActive = vi.fn<(input: SessionMutationInput) => Promise<unknown>>()
    setActive.mockResolvedValue({ data: {} })

    await switchDeviceAccount({
      account: otherAccount,
      accounts: [currentAccount, otherAccount],
      currentUserId: currentAccount.user.id,
      lifecycle: { onAbort: abort, onComplete: complete },
      authClient: freshAuthClient({ setActive }),
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
    expect(setActive).toHaveBeenCalledWith({
      sessionToken: otherAccount.session.token,
      fetchOptions: { throw: true },
    })
  })

  it("一意に解決された現在のセッションのみをサインアウトする", async () => {
    const queryClient = new QueryClient()
    const revoke = vi.fn<(input: SessionMutationInput) => Promise<unknown>>()
    revoke.mockResolvedValue({ data: {} })

    await signOutCurrentDeviceAccount({
      accounts: [currentAccount, otherAccount],
      currentUserId: currentAccount.user.id,
      lifecycle: {},
      authClient: freshAuthClient({ revoke }),
      queryClient,
    })

    expect(revoke).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith({
      sessionToken: currentAccount.session.token,
      fetchOptions: { throw: true },
    })
  })

  it("現在のセッショントークンを一意に特定できない場合は拒否する", async () => {
    const queryClient = new QueryClient()
    const revoke = vi.fn<(input: SessionMutationInput) => Promise<unknown>>()
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
        authClient: freshAuthClient({ revoke }),
        queryClient,
      })
    ).rejects.toThrow("Account state changed. Reload and try again.")

    expect(fetchAgent).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })

  it("現在以外のアカウントを削除しても認証状態を消去しない", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["private"], "current account")
    const revoke = vi.fn<(input: SessionMutationInput) => Promise<unknown>>()
    revoke.mockResolvedValue({ data: {} })

    await removeDeviceAccount({
      account: otherAccount,
      accounts: [currentAccount, otherAccount],
      currentUserId: currentAccount.user.id,
      authClient: freshAuthClient({ revoke }),
    })

    expect(revoke).toHaveBeenCalledWith({
      sessionToken: otherAccount.session.token,
      fetchOptions: { throw: true },
    })
    expect(fetchAgent).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(["private"])).toBe("current account")
  })

  it("アクティベーションが失敗した場合でも古いアカウントのキャッシュをそのまま残す", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(["private"], "old account")
    const complete = vi.fn<() => Promise<void>>().mockResolvedValue()
    const setActive = vi.fn<(input: SessionMutationInput) => Promise<unknown>>()
    const providerError = new Error("provider detail")
    setActive.mockRejectedValue(providerError)

    await expect(
      switchDeviceAccount({
        account: otherAccount,
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        lifecycle: { onComplete: complete },
        authClient: freshAuthClient({ setActive }),
        queryClient,
      })
    ).rejects.toBe(providerError)

    expect(complete).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(["private"])).toBe("old account")
  })

  it("別タブで有効セッションが変わった場合はAgentを取り消す前にサインアウトを拒否する", async () => {
    const queryClient = new QueryClient()
    const revoke = vi.fn<(input: SessionMutationInput) => Promise<unknown>>()

    await expect(
      signOutCurrentDeviceAccount({
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        lifecycle: {},
        authClient: freshAuthClient({
          current: otherAccount,
          revoke,
        }),
        queryClient,
      })
    ).rejects.toThrow("Account state changed. Reload and try again.")

    expect(fetchAgent).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })

  it("別のタブで現在になったアカウントは決して削除しない", async () => {
    const revoke = vi.fn<(input: SessionMutationInput) => Promise<unknown>>()

    await expect(
      removeDeviceAccount({
        account: otherAccount,
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        authClient: freshAuthClient({
          current: otherAccount,
          revoke,
        }),
      })
    ).rejects.toThrow("Account state changed. Reload and try again.")

    expect(fetchAgent).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })

  it("削除中にアクティブなトークンが変更されたときにアイデンティティの変更を報告する", async () => {
    const revoke = vi.fn<(input: SessionMutationInput) => Promise<unknown>>()
    revoke.mockResolvedValue({ data: {} })
    const authClient = freshAuthClient({ revoke })
    const getSession = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({
        session: { token: currentAccount.session.token },
        user: { id: currentAccount.user.id },
      })
      .mockResolvedValueOnce({
        session: { token: otherAccount.session.token },
        user: { id: otherAccount.user.id },
      })

    await expect(
      removeDeviceAccount({
        account: otherAccount,
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        authClient: { ...authClient, getSession },
      })
    ).resolves.toBe(true)

    expect(revoke).toHaveBeenCalledOnce()
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it("古いAgentコンテキストを取り消す前に期限切れの切替先を拒否する", async () => {
    const queryClient = new QueryClient()
    const setActive = vi.fn<(input: SessionMutationInput) => Promise<unknown>>()

    await expect(
      switchDeviceAccount({
        account: otherAccount,
        accounts: [currentAccount, otherAccount],
        currentUserId: currentAccount.user.id,
        lifecycle: {},
        authClient: freshAuthClient({
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
