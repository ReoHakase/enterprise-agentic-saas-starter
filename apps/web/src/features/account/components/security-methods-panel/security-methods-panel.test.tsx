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
  routerNavigate: vi.fn<(input: { href: string }) => void>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("@better-auth-ui/react", async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ authClient: mocks.authClient }),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.routerNavigate,
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

describe("SecurityMethodsPanelの契約", () => {
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

  it("登録済みpasskeyを表示する", async () => {
    renderPanel()

    expect(await screen.findByText("MacBook")).toBeInTheDocument()
    expect(screen.getByText("Backed up")).toBeInTheDocument()
  })

  it("確認後にGitHub連携を解除する", async () => {
    const user = userEvent.setup()
    renderPanel()

    await screen.findByText("GitHub")
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

  it("標準のソーシャルmutationでGitHubを連携する", async () => {
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

  it("オーセンティケーター種別を制限せずパスキーを追加する", async () => {
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

  it("標準のパスキーmutationでパスキーを削除する", async () => {
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

  it("再認証を要求し、戻った後にパスキー設定を再開する", async () => {
    const user = userEvent.setup()
    mocks.authClient.passkey.addPasskey.mockRejectedValueOnce({
      code: "SESSION_NOT_FRESH",
      message: "session row and provider secret must stay private",
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

    await user.click(
      screen.getByRole("button", { name: "Continue to sign in" })
    )
    expect(mocks.routerNavigate).toHaveBeenCalledWith({
      href: "/auth/sign-in?reauth=1&action=account.passkey.add&redirectTo=/settings/account",
    })

    firstRender.unmount()
    mocks.authClient.passkey.addPasskey.mockResolvedValueOnce({})
    renderPanel()

    await waitFor(() => {
      expect(mocks.authClient.passkey.addPasskey).toHaveBeenCalledTimes(2)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Passkey added")
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(
      "provider secret"
    )
  })

  it("既知のパスキーエラーを固定文言で表示する", async () => {
    const user = userEvent.setup()
    mocks.authClient.passkey.addPasskey.mockRejectedValueOnce({
      code: "ERROR_CEREMONY_ABORTED",
      message: "credential=private-provider-material",
    })
    renderPanel()

    await user.click(await screen.findByRole("button", { name: "Add passkey" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Passkey registration was cancelled."
      )
    })
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(
      "private-provider-material"
    )
  })

  it("未知のパスキープロバイダー詳細を公開せず代替文言を表示する", async () => {
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

  it("プロバイダーエラーを漏らさず回復可能な状態を表示する", async () => {
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
