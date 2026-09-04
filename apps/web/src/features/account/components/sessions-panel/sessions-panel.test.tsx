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

const macUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15"

const sessions = [
  {
    id: "session-current",
    current: true,
    expiresAt: "2026-08-14T00:00:00.000Z",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ipAddress: "127.0.0.1",
    userAgent: macUserAgent,
  },
  {
    id: "session-old",
    current: false,
    expiresAt: "2026-08-14T00:00:00.000Z",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    ipAddress: "127.0.0.2",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
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

describe("SessionsPanelの契約", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listSessions.mockResolvedValue(sessions)
    mocks.revokeSession.mockResolvedValue({})
    mocks.revokeOtherSessions.mockResolvedValue({})
  })

  it("代表セッションの公開情報を一覧表示する", async () => {
    renderSessions()

    expect(await screen.findByText("Apple Mac")).toBeInTheDocument()
    expect(screen.getByText("Safari 18.5")).toBeInTheDocument()
    expect(screen.getByText("Updated at")).toBeInTheDocument()
    expect(screen.getByText("Expires at")).toBeInTheDocument()
    expect(screen.getByText(macUserAgent)).toBeInTheDocument()
  })

  it("IP addressを一覧へ公開しない", async () => {
    renderSessions()

    await screen.findByText("Apple Mac")
    expect(screen.queryByText("127.0.0.2")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("columnheader", { name: "IP address" })
    ).not.toBeInTheDocument()
  })

  it("選択したセッションを取り消す", async () => {
    const actor = userEvent.setup()
    renderSessions()

    await actor.click(await screen.findByRole("button", { name: "Revoke" }))
    await actor.click(screen.getByRole("button", { name: "Revoke session" }))

    await waitFor(() => {
      expect(mocks.revokeSession).toHaveBeenCalledWith("session-old")
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Session revoked")
  })

  it("再試行可能な失敗状態をレンダリングする", async () => {
    mocks.listSessions.mockRejectedValueOnce(new Error("Session API failed"))
    renderSessions()

    expect(
      await screen.findByText("Sessions could not be loaded")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled()
  })
})
