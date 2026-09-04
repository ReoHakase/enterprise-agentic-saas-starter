import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useDeviceAccountsController } from "./use-device-accounts-controller"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<unknown>>(),
  listDeviceSessions: vi.fn<() => Promise<unknown>>(),
  navigateAfterAccountSwitch: vi.fn<(returnTo?: string) => void>(),
  revoke: vi.fn<(input: { sessionToken: string }) => Promise<unknown>>(),
  setActive: vi.fn<(input: { sessionToken: string }) => Promise<unknown>>(),
  signOut: vi.fn<() => Promise<unknown>>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

const authClient = {
  getSession: mocks.getSession,
  multiSession: {
    listDeviceSessions: mocks.listDeviceSessions,
    revoke: mocks.revoke,
    setActive: mocks.setActive,
  },
  signOut: mocks.signOut,
}

vi.mock("@better-auth-ui/react", async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ authClient }),
}))

vi.mock("../account-switch-navigation", () => ({
  navigateAfterAccountSwitch: mocks.navigateAfterAccountSwitch,
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

const currentUser = {
  id: "user-current",
  name: "Current User",
  email: "current@example.test",
  profileImage: null,
}

const deviceAccounts = [
  {
    session: { token: "session-current" },
    user: { ...currentUser, image: null },
  },
  {
    session: { token: "session-other" },
    user: {
      id: "user-other",
      name: "Other User",
      email: "other@example.test",
      image: null,
    },
  },
]

const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe("useDeviceAccountsControllerの契約", () => {
  const fetchAgent = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchAgent.mockResolvedValue(Response.json({ contextEpoch: 2 }))
    vi.stubGlobal("fetch", fetchAgent)
    mocks.listDeviceSessions.mockResolvedValue(deviceAccounts)
    mocks.getSession.mockResolvedValue({
      session: { token: "session-current" },
      user: { id: "user-current" },
    })
    mocks.revoke.mockResolvedValue({})
    mocks.setActive.mockResolvedValue({})
  })

  afterEach(() => vi.unstubAllGlobals())

  it("現在のセッションを取り消してサインアウトし、core signOutは呼ばない", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const onAbort = vi.fn<() => void>()
    const onComplete = vi.fn<() => Promise<void>>().mockResolvedValue()
    const { result } = renderHook(
      () =>
        useDeviceAccountsController({
          currentUser,
          enabled: true,
          onAbortIdentityChange: onAbort,
          onCompleteIdentityChange: onComplete,
        }),
      { wrapper: createWrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.accounts).toHaveLength(2))
    act(() => result.current.requestSignOut())

    await waitFor(() =>
      expect(mocks.navigateAfterAccountSwitch).toHaveBeenCalledWith(
        "/dashboard"
      )
    )
    expect(mocks.revoke).toHaveBeenCalledWith({
      sessionToken: "session-current",
      fetchOptions: { throw: true },
    })
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it("認証状態を取り消さず、未保存作業があるサインアウトをキャンセルする", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(["private"], "draft")
    const onCancel = vi.fn<() => void>()
    const { result } = renderHook(
      () =>
        useDeviceAccountsController({
          currentUser,
          enabled: true,
          onPrepareIdentityChange: () => ({
            composer: true,
            uploads: false,
            stagedAssets: false,
            activeTurn: false,
            pendingApprovals: false,
            dirtyIssueForms: true,
          }),
          onCancelIdentityChange: onCancel,
        }),
      { wrapper: createWrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.accounts).toHaveLength(2))
    act(() => result.current.requestSignOut())
    expect(result.current.riskAction?.kind).toBe("sign-out")
    act(() => result.current.cancelRiskAction())

    expect(onCancel).toHaveBeenCalledOnce()
    expect(fetchAgent).not.toHaveBeenCalled()
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(["private"])).toBe("draft")
  })

  it("失敗時も現在のアカウントを有効に保ち、固定エラーを通知する", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(["private"], "current account")
    mocks.revoke.mockRejectedValueOnce(new Error("provider-secret"))
    const onAbort = vi.fn<() => void>()
    const onCancel = vi.fn<() => void>()
    const onComplete = vi.fn<() => Promise<void>>().mockResolvedValue()
    const { result } = renderHook(
      () =>
        useDeviceAccountsController({
          currentUser,
          enabled: true,
          onAbortIdentityChange: onAbort,
          onCancelIdentityChange: onCancel,
          onCompleteIdentityChange: onComplete,
        }),
      { wrapper: createWrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.accounts).toHaveLength(2))
    act(() => result.current.requestSignOut())

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Could not sign out. Try again."
      )
    )
    expect(mocks.navigateAfterAccountSwitch).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(["private"])).toBe("current account")
    expect(onAbort).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it("削除に失敗した対象を保持し、現在の認証状態を消去せず再試行する", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(["private"], "current account")
    mocks.revoke
      .mockRejectedValueOnce(new Error("provider-secret"))
      .mockResolvedValueOnce({})
    const { result } = renderHook(
      () =>
        useDeviceAccountsController({
          currentUser,
          enabled: true,
        }),
      { wrapper: createWrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.accounts).toHaveLength(2))
    const removeTarget = result.current.accounts[1]
    if (!removeTarget) throw new Error("Expected another device account")
    act(() => result.current.requestRemove(removeTarget))
    await waitFor(() =>
      expect(result.current.removeTarget?.session.token).toBe("session-other")
    )
    act(() => result.current.confirmRemove())

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Could not remove account. Try again."
      )
    )
    expect(result.current.removeTarget?.session.token).toBe("session-other")
    expect(fetchAgent).not.toHaveBeenCalled()
    expect(mocks.navigateAfterAccountSwitch).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(["private"])).toBe("current account")

    act(() => result.current.confirmRemove())
    await waitFor(() => expect(result.current.removeTarget).toBeUndefined())
    expect(mocks.revoke).toHaveBeenCalledTimes(2)
    expect(fetchAgent).not.toHaveBeenCalled()
  })

  it("削除中に有効トークンが変わった場合はローカル認証状態を消去して遷移する", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(["private"], "current account")
    const onAbort = vi.fn<() => void>()
    const onComplete = vi.fn<() => Promise<void>>().mockResolvedValue()
    mocks.getSession
      .mockResolvedValueOnce({
        session: { token: "session-current" },
        user: { id: "user-current" },
      })
      .mockResolvedValueOnce({
        session: { token: "session-current" },
        user: { id: "user-current" },
      })
      .mockResolvedValueOnce({
        session: { token: "session-other" },
        user: { id: "user-other" },
      })
    const { result } = renderHook(
      () =>
        useDeviceAccountsController({
          currentUser,
          enabled: true,
          onAbortIdentityChange: onAbort,
          onCompleteIdentityChange: onComplete,
        }),
      { wrapper: createWrapper(queryClient) }
    )

    await waitFor(() => expect(result.current.accounts).toHaveLength(2))
    const removeTarget = result.current.accounts[1]
    if (!removeTarget) throw new Error("Expected another device account")
    act(() => result.current.requestRemove(removeTarget))
    await waitFor(() => expect(result.current.removeTarget).toBe(removeTarget))
    act(() => result.current.confirmRemove())

    await waitFor(() =>
      expect(mocks.navigateAfterAccountSwitch).toHaveBeenCalledWith(
        "/dashboard"
      )
    )
    expect(onAbort).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(["private"])).toBeUndefined()
    expect(fetchAgent).not.toHaveBeenCalled()
  })
})
