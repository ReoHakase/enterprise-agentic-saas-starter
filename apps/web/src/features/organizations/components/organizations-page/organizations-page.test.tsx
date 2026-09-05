import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { httpError } from "@/test-support/http-error"

import type { OrganizationSummary } from "../../schema"
import { OrganizationsPage } from "./organizations-page"

const mocks = vi.hoisted(() => ({
  activateOrganization: vi.fn<(organizationId: string) => Promise<unknown>>(),
  beginOrganizationSwitch: vi.fn<() => Record<string, boolean>>(),
  cancelOrganizationSwitch: vi.fn<() => void>(),
  completeOrganizationSwitch: vi.fn<() => Promise<void>>(),
  createOrganization: vi.fn<(input: unknown) => Promise<unknown>>(),
  hasOrganizationSwitchRisks: vi.fn<() => boolean>(),
  listOrganizations: vi.fn<() => Promise<unknown>>(),
  navigateAfterOrganizationSwitch: vi.fn<(href: string) => void>(),
  prepareOrganizationSwitch: vi.fn<() => Promise<void>>(),
  routerInvalidate: vi.fn<() => void>(),
  toastError:
    vi.fn<(message: string, options?: { description?: string }) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("@/features/agent", () => ({
  hasOrganizationSwitchRisks: mocks.hasOrganizationSwitchRisks,
  useAgentRuntimeState: () => ({
    beginOrganizationSwitch: mocks.beginOrganizationSwitch,
    cancelOrganizationSwitch: mocks.cancelOrganizationSwitch,
    completeOrganizationSwitch: mocks.completeOrganizationSwitch,
  }),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: {
    activateOrganization: mocks.activateOrganization,
    createOrganization: mocks.createOrganization,
    listOrganizations: mocks.listOrganizations,
  },
}))

vi.mock("../../organization-switch-flash", () => ({
  navigateAfterOrganizationSwitch: (
    _storage: Storage,
    _location: Location,
    href: string
  ) => mocks.navigateAfterOrganizationSwitch(href),
}))

vi.mock("../../cache", () => ({
  prepareOrganizationSwitch: mocks.prepareOrganizationSwitch,
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

const permissions = {
  canEditOrganization: true,
  canInviteMembers: true,
  canManageMembers: true,
  canManageAdmins: true,
  canTransferOwnership: true,
}

const organizations: OrganizationSummary[] = [
  {
    id: "org-acme",
    name: "Acme",
    slug: "acme",
    role: "owner" as const,
    active: true,
    profileImage: null,
    memberCount: 2,
    memberProfileImages: [],
    permissions,
  },
  {
    id: "org-beta",
    name: "Beta",
    slug: "beta",
    role: "admin" as const,
    active: false,
    profileImage: null,
    memberCount: 3,
    memberProfileImages: [],
    permissions,
  },
]

const renderOrganizations = (
  initialOrganizations: OrganizationSummary[] = organizations
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <OrganizationsPage initialOrganizations={initialOrganizations} />
    </QueryClientProvider>
  )
}

describe("OrganizationsPageの契約", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.beginOrganizationSwitch.mockReturnValue({})
    mocks.completeOrganizationSwitch.mockResolvedValue()
    mocks.hasOrganizationSwitchRisks.mockReturnValue(false)
    mocks.listOrganizations.mockResolvedValue(organizations)
    mocks.prepareOrganizationSwitch.mockResolvedValue()
    mocks.activateOrganization.mockResolvedValue({})
    mocks.createOrganization.mockResolvedValue({
      ...organizations[0],
      id: "org-new",
      name: "New Team",
      slug: "new-team",
      active: false,
      createdAt: "2026-07-14T00:00:00.000Z",
      invitationCount: 0,
    })
  })

  it("組織tableから有効テナントを切り替える", async () => {
    const actor = userEvent.setup()
    let finishActivation: ((value: unknown) => void) | undefined
    mocks.activateOrganization.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishActivation = resolve
        })
    )
    renderOrganizations()

    await actor.click(screen.getByRole("button", { name: "Switch" }))
    await waitFor(() => {
      expect(mocks.activateOrganization).toHaveBeenCalledWith("org-beta")
    })
    expect(mocks.completeOrganizationSwitch).not.toHaveBeenCalled()
    const resolveActivation = finishActivation
    if (!resolveActivation) throw new Error("Activation did not start")
    await act(async () => resolveActivation({ organizationId: "org-beta" }))
    await waitFor(() =>
      expect(mocks.completeOrganizationSwitch).toHaveBeenCalledOnce()
    )
    expect(screen.getByRole("button", { name: "Active" })).toBeDisabled()
    expect(mocks.routerInvalidate).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Organization switched")
  })

  it("メンバー・設定URLに組織slugを使う", () => {
    renderOrganizations()

    expect(
      screen.getByRole("link", { name: "Members for Acme" })
    ).toHaveAttribute("href", "/organization/acme/members")
    expect(
      screen.getByRole("link", { name: "Settings for Acme" })
    ).toHaveAttribute("href", "/organization/acme/settings")
  })

  it("公開ルート移動後も既存のinvitations slugへ到達可能に保つ", () => {
    renderOrganizations([
      {
        id: "org-invitations",
        name: "Invitation Operations",
        slug: "invitations",
        role: "owner",
        active: true,
        profileImage: null,
        memberCount: 2,
        memberProfileImages: [],
        permissions,
      },
    ])

    expect(
      screen.getByRole("link", { name: "Members for Invitation Operations" })
    ).toHaveAttribute("href", "/organization/invitations/members")
    expect(
      screen.getByRole("link", { name: "Settings for Invitation Operations" })
    ).toHaveAttribute("href", "/organization/invitations/settings")
  })

  it("slugルートを開く前に無効テナントを有効化する", async () => {
    const actor = userEvent.setup()
    renderOrganizations()

    expect(
      screen.queryByRole("link", { name: "Members for Beta" })
    ).not.toBeInTheDocument()
    await actor.click(
      screen.getByRole("button", {
        name: "Switch to Beta and open members",
      })
    )

    await waitFor(() => {
      expect(mocks.activateOrganization).toHaveBeenCalledWith("org-beta")
    })
    await waitFor(() =>
      expect(mocks.navigateAfterOrganizationSwitch).toHaveBeenCalledWith(
        "/organization/beta/members"
      )
    )
    expect(mocks.routerInvalidate).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it("利用者が切替を確認するまで危険なローカルAgent作業を保持する", async () => {
    const actor = userEvent.setup()
    mocks.hasOrganizationSwitchRisks.mockReturnValue(true)
    renderOrganizations()

    await actor.click(screen.getByRole("button", { name: "Switch" }))
    expect(mocks.activateOrganization).not.toHaveBeenCalled()
    expect(
      screen.getByRole("heading", {
        name: "Discard local Agent work and switch?",
      })
    ).toBeVisible()

    await actor.click(
      screen.getByRole("button", { name: "Discard local draft and switch" })
    )
    await waitFor(() =>
      expect(mocks.activateOrganization).toHaveBeenCalledWith("org-beta")
    )
    expect(mocks.completeOrganizationSwitch).toHaveBeenCalledOnce()
  })

  it("組織作成の入力値を保持し、固定の失敗文言を表示する", async () => {
    const actor = userEvent.setup()
    mocks.createOrganization.mockRejectedValueOnce(httpError(409, "conflict"))
    renderOrganizations()

    await actor.click(
      screen.getByRole("button", { name: "Create organization" })
    )
    await actor.type(screen.getByLabelText("Name"), "New Team")
    expect(screen.getByLabelText("Slug")).toHaveValue("new-team")
    await actor.click(
      screen.getByRole("button", { name: "Create organization" })
    )

    expect(
      await screen.findByText("The organization could not be created.")
    ).toBeVisible()
    expect(screen.getByLabelText("Name")).toHaveValue("New Team")
    const slug = screen.getByLabelText("Slug")
    expect(slug).toHaveValue("new-team")

    await actor.type(slug, "-edited")

    expect(
      screen.queryByText("The organization could not be created.")
    ).not.toBeInTheDocument()
  })

  it("組織作成時にサーバー予約済みslugをAPIフィールドエラーとして表示する", async () => {
    const actor = userEvent.setup()
    mocks.createOrganization.mockRejectedValueOnce(
      httpError(400, "validation_error", {
        fieldErrors: { slug: ["Choose another slug."] },
        message: "This organization slug is reserved.",
      })
    )
    renderOrganizations()

    await actor.click(
      screen.getByRole("button", { name: "Create organization" })
    )
    await actor.type(screen.getByLabelText("Name"), "Auth")
    const slug = screen.getByLabelText("Slug")
    expect(slug).toHaveValue("auth")
    await actor.click(
      screen.getByRole("button", { name: "Create organization" })
    )

    await waitFor(() => {
      expect(mocks.createOrganization).toHaveBeenCalledWith({
        name: "Auth",
        slug: "auth",
      })
    })
    expect(await screen.findByText("Choose another slug.")).toBeVisible()
    expect(slug).toHaveAttribute("aria-invalid", "true")
    expect(
      screen.queryByText("The organization could not be created.")
    ).not.toBeInTheDocument()

    await actor.type(slug, "-team")
    expect(screen.queryByText("Choose another slug.")).not.toBeInTheDocument()
  })

  it("切替失敗時に固定の復旧文言を表示する", async () => {
    const actor = userEvent.setup()
    mocks.activateOrganization.mockRejectedValueOnce(
      httpError(503, "service_unavailable")
    )
    renderOrganizations()

    await actor.click(screen.getByRole("button", { name: "Switch" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Could not switch organization",
        {
          description: "Try again. If the problem continues, contact support.",
        }
      )
    })
    expect(mocks.completeOrganizationSwitch).not.toHaveBeenCalled()
    expect(mocks.cancelOrganizationSwitch).toHaveBeenCalledOnce()
  })
})
