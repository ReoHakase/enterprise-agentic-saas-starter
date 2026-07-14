import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountSwitcherDialog } from "./account-switcher-dialog"

const mocks = vi.hoisted(() => ({
  listDeviceSessions: vi.fn<() => Promise<unknown>>(),
  onOpenChange: vi.fn<(open: boolean) => void>(),
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
  image: null,
}

const deviceAccounts = [
  {
    session: { token: "session-current" },
    user: currentUser,
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
}

describe("AccountSwitcherDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listDeviceSessions.mockResolvedValue({ data: deviceAccounts })
    mocks.revoke.mockResolvedValue({ data: {} })
    mocks.setActive.mockResolvedValue({ data: {} })
  })

  it("switches and removes another signed-in account", async () => {
    const actor = userEvent.setup()
    renderDialog()

    expect(await screen.findByText("other@example.test")).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Switch" }))
    await waitFor(() => {
      expect(mocks.setActive).toHaveBeenCalledWith({
        sessionToken: "session-other",
      })
    })
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.refresh).toHaveBeenCalledOnce()
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
})
