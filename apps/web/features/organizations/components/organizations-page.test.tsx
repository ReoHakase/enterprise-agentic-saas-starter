import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConsoleApiError } from "@/lib/console-api"

import { OrganizationsPage } from "./organizations-page"

const mocks = vi.hoisted(() => ({
  activateOrganization: vi.fn<(organizationId: string) => Promise<unknown>>(),
  createOrganization: vi.fn<(input: unknown) => Promise<unknown>>(),
  listOrganizations: vi.fn<() => Promise<unknown>>(),
  refresh: vi.fn<() => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: {
    activateOrganization: mocks.activateOrganization,
    createOrganization: mocks.createOrganization,
    listOrganizations: mocks.listOrganizations,
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn<(message: string) => void>(),
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

const organizations = [
  {
    id: "org-acme",
    name: "Acme",
    slug: "acme",
    role: "super_admin" as const,
    active: true,
    memberCount: 2,
    memberAvatars: [],
    permissions,
  },
  {
    id: "org-beta",
    name: "Beta",
    slug: "beta",
    role: "admin" as const,
    active: false,
    memberCount: 3,
    memberAvatars: [],
    permissions,
  },
]

const renderOrganizations = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <OrganizationsPage initialOrganizations={organizations} />
    </QueryClientProvider>
  )
}

describe("OrganizationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listOrganizations.mockResolvedValue(organizations)
    mocks.activateOrganization.mockResolvedValue({})
    mocks.createOrganization.mockResolvedValue({
      ...organizations[0],
      id: "org-new",
      name: "New Team",
      slug: "new-team",
      active: false,
      logo: null,
      createdAt: "2026-07-14T00:00:00.000Z",
      invitationCount: 0,
    })
  })

  it("switches the active tenant from the organization table", async () => {
    const actor = userEvent.setup()
    renderOrganizations()

    await actor.click(screen.getByRole("button", { name: "Switch" }))
    await waitFor(() => {
      expect(mocks.activateOrganization).toHaveBeenCalledWith("org-beta")
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Organization switched")
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
    expect(screen.getByLabelText("Slug")).toHaveValue("new-team")
  })
})
