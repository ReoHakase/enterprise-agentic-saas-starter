import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SessionsPanel } from "./sessions-panel"

const mocks = vi.hoisted(() => ({
  listSessions: vi.fn<() => Promise<unknown>>(),
  revokeOtherSessions: vi.fn<() => Promise<unknown>>(),
  revokeSession: vi.fn<(sessionId: string) => Promise<unknown>>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: {
    listSessions: mocks.listSessions,
    revokeOtherSessions: mocks.revokeOtherSessions,
    revokeSession: mocks.revokeSession,
  },
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

const sessions = [
  {
    id: "session-current",
    current: true,
    expiresAt: "2026-08-14T00:00:00.000Z",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/140.0",
  },
  {
    id: "session-old",
    current: false,
    expiresAt: "2026-08-14T00:00:00.000Z",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    ipAddress: "127.0.0.2",
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Firefox/140.0",
  },
]

const renderSessions = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SessionsPanel />
    </QueryClientProvider>
  )
}

describe("SessionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listSessions.mockResolvedValue(sessions)
    mocks.revokeSession.mockResolvedValue({})
    mocks.revokeOtherSessions.mockResolvedValue({})
  })

  it("lists recognizable devices and revokes a selected session", async () => {
    const actor = userEvent.setup()
    renderSessions()

    expect(await screen.findByText("Mac (Chrome)")).toBeInTheDocument()
    expect(screen.getByText("Windows PC (Firefox)")).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Revoke" }))
    await actor.click(screen.getByRole("button", { name: "Revoke session" }))

    await waitFor(() => {
      expect(mocks.revokeSession).toHaveBeenCalledWith("session-old")
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Session revoked")
  })

  it("renders a retryable failure state", async () => {
    mocks.listSessions.mockRejectedValueOnce(new Error("Session API failed"))
    renderSessions()

    expect(
      await screen.findByText("Sessions could not be loaded")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled()
  })
})
