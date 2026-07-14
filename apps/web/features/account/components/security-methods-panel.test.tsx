import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SecurityMethodsPanel } from "./security-methods-panel"

const mocks = vi.hoisted(() => ({
  authClient: {
    listAccounts: vi.fn<() => Promise<unknown>>(),
    linkSocial: vi.fn<(input: unknown) => Promise<unknown>>(),
    unlinkAccount: vi.fn<(input: unknown) => Promise<unknown>>(),
    passkey: {
      listUserPasskeys: vi.fn<() => Promise<unknown>>(),
      addPasskey: vi.fn<(input: unknown) => Promise<unknown>>(),
      deletePasskey: vi.fn<(input: unknown) => Promise<unknown>>(),
    },
  },
  refresh: vi.fn<() => void>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("@better-auth-ui/react", () => ({
  useAuth: () => ({ authClient: mocks.authClient }),
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

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SecurityMethodsPanel />
    </QueryClientProvider>
  )
}

describe("SecurityMethodsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authClient.listAccounts.mockResolvedValue({
      data: [
        {
          id: "account-1",
          accountId: "github-user-1",
          providerId: "github",
          createdAt: "2026-07-14T00:00:00.000Z",
        },
      ],
    })
    mocks.authClient.passkey.listUserPasskeys.mockResolvedValue({
      data: [{ id: "passkey-1", name: "MacBook", backedUp: true }],
    })
    mocks.authClient.unlinkAccount.mockResolvedValue({ data: {} })
    mocks.authClient.passkey.deletePasskey.mockResolvedValue({ data: {} })
    mocks.authClient.passkey.addPasskey.mockResolvedValue({ data: {} })
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
        providerId: "github",
        accountId: "github-user-1",
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("GitHub account unlinked")
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
