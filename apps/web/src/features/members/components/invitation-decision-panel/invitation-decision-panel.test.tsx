import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { clientEnv } from "@/lib/env"

import { type InvitationContext } from "../../api"
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
  routerInvalidate: vi.fn<() => Promise<void>>(),
  routerNavigate: vi.fn<(input: { replace?: boolean; to: string }) => void>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("../../api", () => ({
  decideInvitation: mocks.decideInvitation,
  isInvitationAuthenticationError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 401,
  invitationFallbacks: {
    accept: "Invitation could not be accepted. Try again.",
    reject: "Invitation could not be rejected. Try again.",
  },
}))

vi.mock("@/features/account", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/account")>()
  return {
    ...original,
    AccountSwitcherDialog: ({ open }: { open: boolean }) =>
      open ? <div role="dialog">Device accounts</div> : null,
  }
})

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.ComponentProps<"a"> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.routerNavigate,
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
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

describe("InvitationDecisionPanelの契約", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.decideInvitation.mockResolvedValue(undefined)
    mocks.routerInvalidate.mockResolvedValue()
  })

  it("招待の戻り先を保持しつつアカウント作成・サインインを提示する", () => {
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

  it("一致しないアカウントを拒否し、切替・追加経路を提示する", async () => {
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

  it("ハイドレーションまで招待への判断操作を無効にする", async () => {
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

  it("組織contextを表示し、一致するアカウントからだけ承諾する", async () => {
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
        apiBaseUrl: clientEnv.VITE_API_BASE_URL,
        invitationId: "invitation-1",
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Invitation accepted")
    expect(mocks.routerNavigate).toHaveBeenCalledWith({
      replace: true,
      to: "/dashboard",
    })
    expect(mocks.routerInvalidate).not.toHaveBeenCalled()
  })

  it("承諾中にセッションが切れた場合は招待の戻り先付きでサインインへ戻す", async () => {
    const actor = userEvent.setup()
    mocks.decideInvitation.mockRejectedValueOnce(
      Object.assign(new Error("session expired"), { status: 401 })
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
    expect(mocks.routerNavigate).not.toHaveBeenCalled()
  })

  it("承諾操作を表示せず終了済みの招待を説明する", () => {
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

  it("一時的な招待取得失敗に安全な再試行を提示する", async () => {
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

    expect(mocks.routerInvalidate).toHaveBeenCalledOnce()
  })
})
