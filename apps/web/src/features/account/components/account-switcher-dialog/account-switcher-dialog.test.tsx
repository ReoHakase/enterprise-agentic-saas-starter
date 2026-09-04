import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OrganizationSwitchRisks } from "@/features/agent"

import { AccountSwitcherDialog } from "./account-switcher-dialog"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<unknown>>(),
  listDeviceSessions: vi.fn<() => Promise<unknown>>(),
  navigateAfterAccountSwitch: vi.fn<(returnTo?: string) => void>(),
  onOpenChange: vi.fn<(open: boolean) => void>(),
  abortAgentSwitch: vi.fn<() => void>(),
  cancelAgentSwitch: vi.fn<() => void>(),
  completeAgentSwitch: vi.fn<() => Promise<void>>(),
  fetchAgent: vi.fn<typeof fetch>(),
  prepareAgentSwitch: vi.fn<() => OrganizationSwitchRisks>(),
  refresh: vi.fn<() => void>(),
  revoke: vi.fn<(input: { sessionToken: string }) => Promise<unknown>>(),
  setActive: vi.fn<(input: { sessionToken: string }) => Promise<unknown>>(),
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
}

vi.mock("@better-auth-ui/react", async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ authClient }),
}))

vi.mock("../../account-switch-navigation", () => ({
  navigateAfterAccountSwitch: mocks.navigateAfterAccountSwitch,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
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
    user: { ...currentUser, image: currentUser.profileImage },
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

const renderDialog = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AccountSwitcherDialog
        currentUser={currentUser}
        open
        onOpenChange={mocks.onOpenChange}
      />
    </QueryClientProvider>
  )
  return queryClient
}

const renderDialogWithInvitationReturn = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AccountSwitcherDialog
        addAccountHref="/auth/sign-in?add_account=1&redirectTo=%2Finvitations%2Finvitation-1"
        currentUser={currentUser}
        open
        onOpenChange={mocks.onOpenChange}
        returnTo="/invitations/invitation-1"
      />
    </QueryClientProvider>
  )
}

const renderDialogWithAgentBarrier = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AccountSwitcherDialog
        currentUser={currentUser}
        open
        onOpenChange={mocks.onOpenChange}
        onPrepareAgentSwitch={mocks.prepareAgentSwitch}
        onAbortAgentSwitch={mocks.abortAgentSwitch}
        onCancelAgentSwitch={mocks.cancelAgentSwitch}
        onCompleteAgentSwitch={mocks.completeAgentSwitch}
      />
    </QueryClientProvider>
  )
}

const renderDialogWithoutRemoval = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AccountSwitcherDialog
        allowRemove={false}
        currentUser={currentUser}
        open
        onOpenChange={mocks.onOpenChange}
        returnTo="/oauth/organization?signed=1"
      />
    </QueryClientProvider>
  )
}

describe("AccountSwitcherDialogの契約", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchAgent.mockResolvedValue(Response.json({ contextEpoch: 2 }))
    vi.stubGlobal("fetch", mocks.fetchAgent)
    mocks.listDeviceSessions.mockResolvedValue(deviceAccounts)
    mocks.getSession.mockResolvedValue({
      session: { token: "session-current" },
      user: { id: "user-current" },
    })
    mocks.revoke.mockResolvedValue({})
    mocks.setActive.mockResolvedValue({})
    mocks.completeAgentSwitch.mockResolvedValue()
    mocks.prepareAgentSwitch.mockReturnValue({
      composer: false,
      uploads: false,
      stagedAssets: false,
      activeTurn: false,
      pendingApprovals: false,
      dirtyIssueForms: false,
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("サインインしている別のアカウントへ切り替える", async () => {
    const actor = userEvent.setup()
    renderDialog()

    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Switch" }))
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(mocks.navigateAfterAccountSwitch).toHaveBeenCalledWith(
        "/dashboard"
      )
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Switched to other@example.test"
    )
  })

  it("サインインしている別のアカウントをデバイスから削除する", async () => {
    const actor = userEvent.setup()
    renderDialog()

    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    await actor.click(
      screen.getByRole("button", {
        name: "Remove other@example.test from this device",
      })
    )
    await actor.click(screen.getByRole("button", { name: "Remove account" }))
    await waitFor(() => {
      expect(mocks.revoke).toHaveBeenCalledWith({
        sessionToken: "session-other",
        fetchOptions: { throw: true },
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "other@example.test was removed"
    )
  })

  it("デバイスの削除を公開せずに OAuth アカウントを切り替える", async () => {
    const actor = userEvent.setup()
    renderDialogWithoutRemoval()

    const otherAccount = await screen.findByRole("group", {
      name: "Account other@example.test",
    })
    expect(
      screen.queryByRole("button", {
        name: "Remove other@example.test from this device",
      })
    ).toBeNull()
    await actor.click(
      within(otherAccount).getByRole("button", { name: "Switch" })
    )

    await waitFor(() => expect(mocks.setActive).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(mocks.navigateAfterAccountSwitch).toHaveBeenCalledWith(
        "/oauth/organization?signed=1"
      )
    )
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it("プロバイダー障害に対する安全な再試行状態を表示する", async () => {
    mocks.listDeviceSessions.mockRejectedValueOnce(
      new Error("private provider response")
    )
    renderDialog()

    expect(
      await screen.findByText("Accounts could not be loaded")
    ).toBeInTheDocument()
    expect(
      screen.queryByText("private provider response")
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled()
  })

  it("アカウント追加・切替時も招待の戻り先を保持する", async () => {
    const actor = userEvent.setup()
    renderDialogWithInvitationReturn()

    expect(
      await screen.findByRole("link", { name: "Add account" })
    ).toHaveAttribute(
      "href",
      "/auth/sign-in?add_account=1&redirectTo=%2Finvitations%2Finvitation-1"
    )
    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Switch" }))
    await waitFor(() =>
      expect(mocks.navigateAfterAccountSwitch).toHaveBeenCalledWith(
        "/invitations/invitation-1"
      )
    )
  })

  it("アカウント切替が拒否された場合に単一の代替操作を表示する", async () => {
    const actor = userEvent.setup()
    mocks.setActive.mockRejectedValueOnce(
      new Error("BETTER_AUTH_SECRET=provider-secret")
    )
    renderDialog()

    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Switch" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledOnce()
    })
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Could not switch account. Try again."
    )
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(screen.queryByText(/provider-secret/u)).not.toBeInTheDocument()
  })

  it("Agentコンテキストの取り消し失敗時も元のアカウントを有効に保つ", async () => {
    const actor = userEvent.setup()
    mocks.fetchAgent.mockRejectedValueOnce(
      new Error("AGENT_INTERNAL_GRANT=private-provider-detail")
    )
    renderDialog()

    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Switch" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(mocks.setActive).not.toHaveBeenCalled()
    expect(mocks.navigateAfterAccountSwitch).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(
      screen.queryByText(/private-provider-detail/u)
    ).not.toBeInTheDocument()
  })

  it("アカウント切替をキャンセルしたとき未保存の作業を保持する", async () => {
    const actor = userEvent.setup()
    mocks.prepareAgentSwitch.mockReturnValueOnce({
      composer: true,
      uploads: false,
      stagedAssets: false,
      activeTurn: false,
      pendingApprovals: false,
      dirtyIssueForms: true,
    })
    renderDialogWithAgentBarrier()

    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Switch" }))
    expect(
      screen.getByRole("alertdialog", {
        name: "Discard local Agent work and switch account?",
      })
    ).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Stay here" }))

    expect(mocks.cancelAgentSwitch).toHaveBeenCalledOnce()
    expect(mocks.fetchAgent).not.toHaveBeenCalled()
    expect(mocks.abortAgentSwitch).not.toHaveBeenCalled()
    expect(mocks.setActive).not.toHaveBeenCalled()
  })

  it("アカウント有効化を二重送信から保護する", async () => {
    const actor = userEvent.setup()
    let finishActivation: (() => void) | undefined
    mocks.setActive.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishActivation = () => resolve({ data: {} })
        })
    )
    renderDialog()

    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    const switchButton = screen.getByRole("button", { name: "Switch" })
    await actor.dblClick(switchButton)

    await waitFor(() => expect(mocks.setActive).toHaveBeenCalledOnce())
    finishActivation?.()
    await waitFor(() =>
      expect(mocks.navigateAfterAccountSwitch).toHaveBeenCalledOnce()
    )
  })
})
