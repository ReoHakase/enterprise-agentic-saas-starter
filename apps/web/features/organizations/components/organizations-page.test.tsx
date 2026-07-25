import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConsoleApiError } from "@/features/console/api.public"

import type { OrganizationSummary } from "../schema"
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
  replace: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
  toastError:
    vi.fn<(message: string, options?: { description?: string }) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("@/features/agent/runtime-state.public", () => ({
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

vi.mock("../organization-switch-flash", () => ({
  navigateAfterOrganizationSwitch: (
    _storage: Storage,
    _location: Location,
    href: string
  ) => mocks.navigateAfterOrganizationSwitch(href),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/organizations",
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
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
  canTransferSuperAdmin: true,
}

const organizations: OrganizationSummary[] = [
  {
    id: "org-acme",
    name: "Acme",
    slug: "acme",
    role: "super_admin" as const,
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

describe("OrganizationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.beginOrganizationSwitch.mockReturnValue({})
    mocks.completeOrganizationSwitch.mockResolvedValue()
    mocks.hasOrganizationSwitchRisks.mockReturnValue(false)
    mocks.listOrganizations.mockResolvedValue(organizations)
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

  it("switches the active tenant from the organization table", async () => {
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
    expect(mocks.replace).toHaveBeenCalledWith("/settings/organizations")
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Organization switched")
  })

  it("uses organization slugs in member and settings URLs", () => {
    renderOrganizations()

    expect(
      screen.getByRole("link", { name: "Members for Acme" })
    ).toHaveAttribute("href", "/organization/acme/members")
    expect(
      screen.getByRole("link", { name: "Settings for Acme" })
    ).toHaveAttribute("href", "/organization/acme/settings")
  })

  it("keeps an existing invitations slug reachable after the public route move", () => {
    renderOrganizations([
      {
        id: "org-invitations",
        name: "Invitation Operations",
        slug: "invitations",
        role: "super_admin",
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

  it("activates an inactive tenant before opening its slug route", async () => {
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
    expect(mocks.navigateAfterOrganizationSwitch).toHaveBeenCalledWith(
      "/organization/beta/members"
    )
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it("keeps risky local Agent work until the user confirms the switch", async () => {
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

  it("keeps create input and renders API field errors below it", async () => {
    const actor = userEvent.setup()
    mocks.createOrganization.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "validation_failed",
        fieldErrors: { slug: ["This slug is already in use."] },
        message: "Fix the highlighted field.",
        status: 409,
      })
    )
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
      await screen.findByText("This slug is already in use.")
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("New Team")
    const slug = screen.getByLabelText("Slug")
    expect(slug).toHaveValue("new-team")
    expect(slug).toHaveAccessibleDescription(/This slug is already in use\./u)
    expect(
      screen.queryByText("Fix the highlighted field.")
    ).not.toBeInTheDocument()

    await actor.type(slug, "-edited")

    expect(
      screen.queryByText("This slug is already in use.")
    ).not.toBeInTheDocument()
    expect(slug).not.toHaveAccessibleDescription(
      /This slug is already in use\./u
    )
  })

  it("shows a safe retry and support reference when switching fails", async () => {
    const actor = userEvent.setup()
    mocks.activateOrganization.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "service_unavailable",
        context: { retryAfter: 4 },
        message: "Organization service is temporarily unavailable.",
        requestId: "req_switch_01",
        status: 503,
      })
    )
    renderOrganizations()

    await actor.click(screen.getByRole("button", { name: "Switch" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Organization service is temporarily unavailable.",
        {
          description: "Try again in 4 seconds. Reference ID: req_switch_01",
        }
      )
    })
    expect(mocks.completeOrganizationSwitch).not.toHaveBeenCalled()
    expect(mocks.cancelOrganizationSwitch).toHaveBeenCalledOnce()
  })
})
