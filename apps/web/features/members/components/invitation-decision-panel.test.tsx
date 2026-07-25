import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { clientEnv } from "@/lib/env.client"

import { InvitationAuthenticationError, type InvitationContext } from "../api"
import { InvitationDecisionPanel } from "./invitation-decision-panel"

const mocks = vi.hoisted(() => ({
  decideInvitation:
    vi.fn<
      (input: {
        action: "accept" | "reject"
        apiBaseUrl: string
        invitationId: string
      }) => Promise<void>
    >(),
  refresh: vi.fn<() => void>(),
  replace: vi.fn<(path: string) => void>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("../api", () => ({
  decideInvitation: mocks.decideInvitation,
  InvitationAuthenticationError: class extends Error {},
  InvitationDecisionError: class InvitationDecisionError extends Error {},
  invitationFallbacks: {
    accept: "Invitation could not be accepted. Try again.",
    reject: "Invitation could not be rejected. Try again.",
  },
}))

vi.mock("@/features/account/account-switcher-dialog.public", () => ({
  AccountSwitcherDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Device accounts</div> : null,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

const currentUser = {
  id: "user-recipient",
  name: "Recipient User",
  email: "recipient@example.test",
  profileImage: null,
}

const invitation: InvitationContext = {
  id: "invitation-1",
  organizationId: "org-1",
  organizationName: "Acme",
  organizationSlug: "acme",
  inviterEmail: "owner@example.test",
  role: "member",
  status: "pending",
  expiresAt: "2026-07-18T00:00:00.000Z",
  createdAt: "2026-07-16T00:00:00.000Z",
}

const renderPanel = (panel: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
  render(
    <QueryClientProvider client={queryClient}>{panel}</QueryClientProvider>
  )
}

describe("InvitationDecisionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.decideInvitation.mockResolvedValue(undefined)
  })

  it("offers account creation and sign-in while preserving the invitation return path", () => {
    renderPanel(
      <InvitationDecisionPanel invitationId="invitation-1" state="signed_out" />
    )

    expect(
      screen.getByRole("link", { name: "Create account" })
    ).toHaveAttribute(
      "href",
      "/auth/sign-up?redirectTo=%2Finvitations%2Finvitation-1"
    )
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in?redirectTo=%2Finvitations%2Finvitation-1"
    )
  })

  it("blocks a mismatched account and offers switch or add-account paths", async () => {
    const actor = userEvent.setup()
    renderPanel(
      <InvitationDecisionPanel
        currentUserEmail={currentUser.email}
        currentUserId={currentUser.id}
        currentUserProfileImage={currentUser.profileImage}
        currentUserName={currentUser.name}
        invitationId="invitation-1"
        state="recipient_mismatch"
      />
    )

    expect(screen.getByText("recipient@example.test")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Add account" })).toHaveAttribute(
      "href",
      "/auth/sign-in?redirectTo=%2Finvitations%2Finvitation-1&add_account=1"
    )
    expect(
      screen.queryByRole("button", { name: "Accept invitation" })
    ).not.toBeInTheDocument()

    await actor.click(screen.getByRole("button", { name: "Switch account" }))
    expect(screen.getByRole("dialog")).toHaveTextContent("Device accounts")
  })

  it("keeps invitation decisions inert until hydration", async () => {
    const container = document.createElement("div")
    const panel = (
      <QueryClientProvider client={new QueryClient()}>
        <InvitationDecisionPanel
          currentUserEmail={currentUser.email}
          currentUserId={currentUser.id}
          currentUserProfileImage={currentUser.profileImage}
          currentUserName={currentUser.name}
          invitation={invitation}
          invitationId="invitation-1"
          state="ready"
        />
      </QueryClientProvider>
    )
    container.innerHTML = renderToString(panel)
    document.body.appendChild(container)

    expect(
      within(container).getByRole("button", { name: "Reject" })
    ).toBeDisabled()
    expect(
      within(container).getByRole("button", { name: "Accept invitation" })
    ).toBeDisabled()

    render(panel, { container, hydrate: true })
    await waitFor(() => {
      expect(
        within(container).getByRole("button", { name: "Reject" })
      ).toBeEnabled()
      expect(
        within(container).getByRole("button", {
          name: "Accept invitation",
        })
      ).toBeEnabled()
    })
  })

  it("shows organization context and accepts only from the matching account", async () => {
    const actor = userEvent.setup()
    renderPanel(
      <InvitationDecisionPanel
        currentUserEmail={currentUser.email}
        currentUserId={currentUser.id}
        currentUserProfileImage={currentUser.profileImage}
        currentUserName={currentUser.name}
        invitation={invitation}
        invitationId="invitation-1"
        state="ready"
      />
    )

    expect(screen.getByRole("heading", { name: "Join Acme" })).toBeVisible()
    expect(
      screen.getByText("owner@example.test", { exact: false })
    ).toBeVisible()
    await actor.click(screen.getByRole("button", { name: "Accept invitation" }))

    await waitFor(() => {
      expect(mocks.decideInvitation).toHaveBeenCalledWith({
        action: "accept",
        apiBaseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
        invitationId: "invitation-1",
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Invitation accepted")
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard")
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("returns to sign-in with the invitation path when the session expires during acceptance", async () => {
    const actor = userEvent.setup()
    mocks.decideInvitation.mockRejectedValueOnce(
      new InvitationAuthenticationError()
    )
    renderPanel(
      <InvitationDecisionPanel
        currentUserEmail={currentUser.email}
        currentUserId={currentUser.id}
        currentUserProfileImage={currentUser.profileImage}
        currentUserName={currentUser.name}
        invitation={invitation}
        invitationId="invitation-1"
        state="ready"
      />
    )

    await actor.click(screen.getByRole("button", { name: "Accept invitation" }))

    expect(
      await screen.findByRole("heading", { name: "Sign in to continue" })
    ).toBeVisible()
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in?redirectTo=%2Finvitations%2Finvitation-1"
    )
    expect(
      screen.queryByRole("button", { name: "Accept invitation" })
    ).not.toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("explains terminal invitations without exposing an accept action", () => {
    renderPanel(
      <InvitationDecisionPanel
        currentUserEmail={currentUser.email}
        currentUserId={currentUser.id}
        currentUserProfileImage={currentUser.profileImage}
        currentUserName={currentUser.name}
        invitationId="invitation-1"
        state="unavailable"
      />
    )

    expect(screen.getByText("Invitation unavailable")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Accept invitation" })
    ).not.toBeInTheDocument()
  })

  it("offers a safe retry for transient invitation lookup failures", async () => {
    const actor = userEvent.setup()
    renderPanel(
      <InvitationDecisionPanel
        currentUserEmail={currentUser.email}
        currentUserId={currentUser.id}
        currentUserProfileImage={currentUser.profileImage}
        currentUserName={currentUser.name}
        invitationId="invitation-1"
        state="load_error"
      />
    )

    expect(screen.getByText("Invitation could not be loaded")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Accept invitation" })
    ).not.toBeInTheDocument()

    await actor.click(screen.getByRole("button", { name: "Try again" }))

    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
