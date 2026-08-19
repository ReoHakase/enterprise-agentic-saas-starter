import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fictionalOrganizations } from "../../../organizations/test-support/fixtures"
import { McpOAuthSessionsPanel } from "./mcp-oauth-sessions-panel"

const mocks = vi.hoisted(() => ({
  listMcpOAuthSessions: vi.fn<() => Promise<unknown>>(),
  revokeMcpOAuthSession: vi.fn<(credentialId: string) => Promise<unknown>>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  getBrowserConsoleApi: () => ({
    listMcpOAuthSessions: mocks.listMcpOAuthSessions,
    revokeMcpOAuthSession: mocks.revokeMcpOAuthSession,
  }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

const credentials = [
  {
    clientName: "Codex",
    createdAt: "2026-08-12T00:00:00.000Z",
    credentialId: "r_refresh_1",
    expiresAt: "2026-09-12T00:00:00.000Z",
    organization: fictionalOrganizations[0],
    refreshable: true,
    scopes: ["offline_access", "issues:read", "issues:update"],
  },
] as const

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <McpOAuthSessionsPanel />
    </QueryClientProvider>
  )
}

describe("McpOAuthSessionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listMcpOAuthSessions.mockResolvedValue(credentials)
    mocks.revokeMcpOAuthSession.mockResolvedValue({ id: "r_refresh_1" })
  })

  it("shows linked organization, role, scopes, and revokes a credential family", async () => {
    const actor = userEvent.setup()
    renderPanel()

    expect(await screen.findByText("Codex")).toBeInTheDocument()
    expect(screen.getByText("Acme Cloud")).toBeInTheDocument()
    expect(screen.getByText("Owner")).toBeInTheDocument()
    expect(
      screen.getByRole("table", { name: "Requested access" })
    ).toHaveTextContent("Issues")

    await actor.click(screen.getByRole("button", { name: "Revoke" }))
    await actor.click(screen.getByRole("button", { name: "Revoke access" }))

    await waitFor(() => {
      expect(mocks.revokeMcpOAuthSession).toHaveBeenCalledWith("r_refresh_1")
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("MCP access revoked")
  })

  it("renders a retryable failure state", async () => {
    mocks.listMcpOAuthSessions.mockRejectedValueOnce(
      new Error("MCP API failed")
    )
    renderPanel()

    expect(
      await screen.findByText("MCP access could not be loaded")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled()
  })
})
