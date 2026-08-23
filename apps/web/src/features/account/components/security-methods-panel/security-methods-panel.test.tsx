import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SecurityMethodsPanel } from "./security-methods-panel"

const mocks = vi.hoisted(() => ({
  authClient: {
    getSession: vi.fn<() => Promise<unknown>>(),
    listAccounts: vi.fn<() => Promise<unknown>>(),
    linkSocial: vi.fn<(input: unknown) => Promise<unknown>>(),
    unlinkAccount: vi.fn<(input: unknown) => Promise<unknown>>(),
    passkey: {
      listUserPasskeys: vi.fn<() => Promise<unknown>>(),
      addPasskey: vi.fn<(input: unknown) => Promise<unknown>>(),
      deletePasskey: vi.fn<(input: unknown) => Promise<unknown>>(),
    },
    signIn: { passkey: vi.fn<() => void>() },
  },
  refresh: vi.fn<() => void>(),
  push: vi.fn<(href: string) => void>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("@better-auth-ui/react", async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ authClient: mocks.authClient }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SecurityMethodsPanel />
    </QueryClientProvider>
  )
}

describe("SecurityMethodsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mocks.authClient.getSession.mockResolvedValue({
      session: { token: "session-current" },
      user: { id: "user-current" },
    })
    mocks.authClient.listAccounts.mockResolvedValue([
      {
        id: "account-1",
        accountId: "github-user-1",
        providerId: "github",
        createdAt: "2026-07-14T00:00:00.000Z",
      },
    ])
    mocks.authClient.passkey.listUserPasskeys.mockResolvedValue([
      { id: "passkey-1", name: "MacBook", backedUp: true },
    ])
    mocks.authClient.linkSocial.mockResolvedValue({})
    mocks.authClient.unlinkAccount.mockResolvedValue({})
    mocks.authClient.passkey.deletePasskey.mockResolvedValue({})
    mocks.authClient.passkey.addPasskey.mockResolvedValue({})
  })

  it("loads linked accounts and removes GitHub after confirmation", async () => {
    const user = userEvent.setup()
    renderPanel()

    expect(await screen.findByText("MacBook")).toBeInTheDocument()
    expect(screen.getByText("Backed up")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Unlink" }))
    await user.click(screen.getByRole("button", { name: "Unlink GitHub" }))

    await waitFor(() => {
      expect(mocks.authClient.unlinkAccount).toHaveBeenCalledWith({
        accountId: "github-user-1",
        fetchOptions: { throw: true },
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("GitHub account unlinked")
  })

  it("links GitHub through the standard social mutation", async () => {
    const user = userEvent.setup()
    mocks.authClient.listAccounts.mockResolvedValueOnce([])
    renderPanel()

    await user.click(await screen.findByRole("button", { name: "Link GitHub" }))

    await waitFor(() => {
      expect(mocks.authClient.linkSocial).toHaveBeenCalledWith({
        provider: "github",
        callbackURL: "http://localhost:3000/settings/account",
        fetchOptions: { throw: true },
      })
    })
  })

  it("adds a passkey without restricting the authenticator type", async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(await screen.findByRole("button", { name: "Add passkey" }))

    await waitFor(() => {
      expect(mocks.authClient.passkey.addPasskey).toHaveBeenCalledWith({
        name: "Enterprise Agentic SaaS",
        fetchOptions: { throw: true },
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Passkey added")
  })

  it("deletes a passkey through the standard passkey mutation", async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(await screen.findByRole("button", { name: "Delete" }))
    await user.click(screen.getByRole("button", { name: "Delete passkey" }))

    await waitFor(() => {
      expect(mocks.authClient.passkey.deletePasskey).toHaveBeenCalledWith({
        id: "passkey-1",
        fetchOptions: { throw: true },
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Passkey deleted")
  })

  it("requires a fresh sign-in and resumes passkey setup after returning", async () => {
    const user = userEvent.setup()
    mocks.authClient.passkey.addPasskey.mockRejectedValueOnce({
      code: "SESSION_NOT_FRESH",
      message: "session row and provider secret must stay private",
    })
    mocks.authClient.passkey.addPasskey.mockRejectedValueOnce({
      code: "SESSION_NOT_FRESH",
      message: "another private session timestamp",
    })
    const firstRender = renderPanel()

    const addPasskey = await screen.findByRole("button", {
      name: "Add passkey",
    })
    await user.click(addPasskey)
    expect(
      await screen.findByRole("alertdialog", {
        name: "Sign in again to add a passkey",
      })
    ).toBeVisible()
    expect(mocks.toastError).not.toHaveBeenCalled()

    await user.keyboard("{Escape}")
    expect(addPasskey).toHaveFocus()
    await user.click(addPasskey)
    expect(
      await screen.findByRole("alertdialog", {
        name: "Sign in again to add a passkey",
      })
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "Continue to sign in" })
    )
    expect(mocks.push).toHaveBeenCalledWith(
      "/auth/sign-in?reauth=1&action=account.passkey.add&redirectTo=/settings/account"
    )

    firstRender.unmount()
    mocks.authClient.passkey.addPasskey.mockResolvedValueOnce({})
    renderPanel()

    await waitFor(() => {
      expect(mocks.authClient.passkey.addPasskey).toHaveBeenCalledTimes(3)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Passkey added")
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(
      "provider secret"
    )
  })

  it.each([
    ["ERROR_CEREMONY_ABORTED", "Passkey registration was cancelled."],
    [
      "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
      "That passkey is already registered.",
    ],
  ])("maps %s to a fixed passkey message", async (code, message) => {
    const user = userEvent.setup()
    mocks.authClient.passkey.addPasskey.mockRejectedValueOnce({
      code,
      message: "credential=private-provider-material",
    })
    renderPanel()

    await user.click(await screen.findByRole("button", { name: "Add passkey" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(message)
    })
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(
      "private-provider-material"
    )
  })

  it("falls back without exposing unknown passkey provider details", async () => {
    const user = userEvent.setup()
    mocks.authClient.passkey.addPasskey.mockRejectedValueOnce({
      code: "UNKNOWN_ERROR",
      message: "BETTER_AUTH_SECRET=must-never-render",
    })
    renderPanel()

    await user.click(await screen.findByRole("button", { name: "Add passkey" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "The security method could not be updated. Try again."
      )
    })
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(
      "must-never-render"
    )
  })

  it("shows a recoverable state without leaking provider errors", async () => {
    mocks.authClient.listAccounts.mockRejectedValueOnce(
      new Error("private provider detail")
    )
    renderPanel()

    expect(
      await screen.findByText("Security methods could not be loaded")
    ).toBeInTheDocument()
    expect(
      screen.queryByText("private provider detail")
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled()
  })
})
