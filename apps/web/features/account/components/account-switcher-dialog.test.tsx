import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OrganizationSwitchRisks } from "@/features/agent"

import { AccountSwitcherDialog } from "./account-switcher-dialog"

const mocks = vi.hoisted(() => ({
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
  multiSession: {
    listDeviceSessions: mocks.listDeviceSessions,
    revoke: mocks.revoke,
    setActive: mocks.setActive,
  },
}

vi.mock("@better-auth-ui/react", () => ({
  useAuth: () => ({ authClient }),
}))

vi.mock("../account-switch-navigation", () => ({
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

describe("AccountSwitcherDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchAgent.mockResolvedValue(Response.json({ contextEpoch: 2 }))
    vi.stubGlobal("fetch", mocks.fetchAgent)
    mocks.listDeviceSessions.mockResolvedValue({ data: deviceAccounts })
    mocks.revoke.mockResolvedValue({ data: {} })
    mocks.setActive.mockResolvedValue({ data: {} })
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

  it("switches and removes another signed-in account", async () => {
    const actor = userEvent.setup()
    const queryClient = renderDialog()
    queryClient.setQueryData(
      ["issues", "list", "org-private"],
      [{ title: "Private issue" }]
    )
    mocks.setActive.mockImplementationOnce(async () => {
      expect(
        queryClient.getQueryData(["issues", "list", "org-private"])
      ).toEqual([{ title: "Private issue" }])
      return { data: {} }
    })

    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Switch" }))
    await waitFor(() => {
      expect(mocks.setActive).toHaveBeenCalledWith({
        sessionToken: "session-other",
      })
    })
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(mocks.navigateAfterAccountSwitch).toHaveBeenCalledWith(
        "/dashboard"
      )
    )
    expect(
      queryClient.getQueryData(["issues", "list", "org-private"])
    ).toBeUndefined()
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Switched to other@example.test"
    )

    await actor.click(
      screen.getByRole("button", {
        name: "Remove other@example.test from this device",
      })
    )
    await actor.click(screen.getByRole("button", { name: "Remove account" }))
    await waitFor(() => {
      expect(mocks.revoke).toHaveBeenCalledWith({
        sessionToken: "session-other",
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "other@example.test was removed"
    )
  })

  it("shows a safe retry state for provider failures", async () => {
    mocks.listDeviceSessions.mockResolvedValueOnce({
      error: { message: "private provider response" },
    })
    renderDialog()

    expect(
      await screen.findByText("Accounts could not be loaded")
    ).toBeInTheDocument()
    expect(
      screen.queryByText("private provider response")
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled()
  })

  it("revokes the old Agent context before switching an account", async () => {
    const actor = userEvent.setup()
    renderDialogWithAgentBarrier()

    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Switch" }))

    await waitFor(() => expect(mocks.setActive).toHaveBeenCalledOnce())
    expect(mocks.prepareAgentSwitch).toHaveBeenCalledOnce()
    expect(mocks.fetchAgent).toHaveBeenCalledOnce()
    const requestInput = mocks.fetchAgent.mock.calls[0]?.[0]
    if (!requestInput) throw new Error("Expected Agent context revoke request")
    expect(new Request(requestInput).url).toContain("/agent/context/revoke")
    expect(mocks.fetchAgent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.abortAgentSwitch.mock.invocationCallOrder[0] ?? 0
    )
    expect(mocks.abortAgentSwitch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setActive.mock.invocationCallOrder[0] ?? 0
    )
    await waitFor(() =>
      expect(mocks.completeAgentSwitch).toHaveBeenCalledOnce()
    )
    expect(mocks.navigateAfterAccountSwitch).toHaveBeenCalledWith("/dashboard")
  })

  it("preserves an invitation return path when adding or switching accounts", async () => {
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
    await waitFor(() => expect(mocks.setActive).toHaveBeenCalledOnce())
    expect(mocks.fetchAgent).toHaveBeenCalledOnce()
    expect(mocks.fetchAgent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setActive.mock.invocationCallOrder[0] ?? 0
    )
    await waitFor(() =>
      expect(mocks.navigateAfterAccountSwitch).toHaveBeenCalledWith(
        "/invitations/invitation-1"
      )
    )
  })

  it("shows one operation fallback when account switching rejects", async () => {
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
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(screen.queryByText(/provider-secret/u)).not.toBeInTheDocument()
  })

  it("keeps the old account active when Agent context revocation fails", async () => {
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
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(
      screen.queryByText(/private-provider-detail/u)
    ).not.toBeInTheDocument()
  })
})
