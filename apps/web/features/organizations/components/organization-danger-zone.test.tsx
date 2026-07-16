import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OrganizationDetail } from "@/features/organizations/schema"
import { ConsoleApiError } from "@/lib/console-api"

import { OrganizationDangerZone } from "./organization-danger-zone"

type DeleteOrganization = (
  organizationId: string,
  input: {
    slug: string
    confirmation: "DELETE"
    idempotencyKey: string
  }
) => Promise<{
  deletionId: string
  organizationId: string
  status: "deleted"
}>

const mocks = vi.hoisted(() => ({
  deleteOrganization: vi.fn<DeleteOrganization>(),
  refresh: vi.fn<() => void>(),
  replace: vi.fn<(href: string) => void>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: {
    deleteOrganization: mocks.deleteOrganization,
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

const organization: OrganizationDetail = {
  id: "org-acme",
  name: "Acme",
  slug: "acme",
  logo: null,
  role: "super_admin",
  active: true,
  createdAt: "2026-07-14T00:00:00.000Z",
  invitationCount: 0,
  memberCount: 2,
  memberAvatars: [],
  permissions: {
    canEditOrganization: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageAdmins: true,
    canTransferSuperAdmin: true,
  },
}

const renderDangerZone = (value = organization) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <OrganizationDangerZone organization={value} />
    </QueryClientProvider>
  )
}

describe("OrganizationDangerZone", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteOrganization.mockResolvedValue({
      deletionId: "deletion-1",
      organizationId: organization.id,
      status: "deleted",
    })
  })

  it("requires both exact confirmations before an immediate deletion", async () => {
    const user = userEvent.setup()
    renderDangerZone()

    await user.click(
      screen.getByRole("button", { name: "Delete organization" })
    )

    const deleteButton = screen.getByRole("button", {
      name: "Permanently delete",
    })
    expect(deleteButton).toBeDisabled()

    await user.type(screen.getByLabelText("Type the organization slug"), "acme")
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE")
    expect(deleteButton).toBeEnabled()

    await user.click(deleteButton)

    await waitFor(() => {
      expect(mocks.deleteOrganization).toHaveBeenCalledWith(
        organization.id,
        expect.objectContaining({
          slug: organization.slug,
          confirmation: "DELETE",
          idempotencyKey: expect.stringMatching(/^delete_org_[a-f\d]{32}$/u),
        })
      )
    })
    expect(mocks.replace).toHaveBeenCalledWith("/settings/organizations")
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Organization deleted")
  })

  it("does not expose organization deletion to non-Super Admins", () => {
    renderDangerZone({
      ...organization,
      role: "admin",
      permissions: {
        ...organization.permissions,
        canManageAdmins: false,
        canTransferSuperAdmin: false,
      },
    })

    expect(
      screen.queryByRole("button", { name: "Delete organization" })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Only the Super Admin/u)).toBeInTheDocument()
  })

  it("keeps confirmations and offers reauthentication when the session is stale", async () => {
    const user = userEvent.setup()
    mocks.deleteOrganization.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "step_up_required",
        context: { action: "organization.delete", maxAgeSeconds: 600 },
        message: "Recent authentication required",
        status: 403,
      })
    )
    renderDangerZone()

    await user.click(
      screen.getByRole("button", { name: "Delete organization" })
    )
    await user.type(screen.getByLabelText("Type the organization slug"), "acme")
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE")
    await user.click(screen.getByRole("button", { name: "Permanently delete" }))

    const reauthenticate = await screen.findByRole("link", {
      name: "Sign in again",
    })
    expect(reauthenticate).toHaveAttribute(
      "href",
      expect.stringContaining("reauth=1")
    )
    expect(screen.getByLabelText("Type the organization slug")).toHaveValue(
      "acme"
    )
    expect(screen.getByLabelText("Type DELETE to confirm")).toHaveValue(
      "DELETE"
    )
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it("owns a server failure in the destructive dialog without a duplicate toast", async () => {
    const user = userEvent.setup()
    mocks.deleteOrganization.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "internal_error",
        message: "Internal server error",
        requestId: "req_delete_01",
        status: 500,
      })
    )
    renderDangerZone()

    await user.click(
      screen.getByRole("button", { name: "Delete organization" })
    )
    await user.type(screen.getByLabelText("Type the organization slug"), "acme")
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE")
    await user.click(screen.getByRole("button", { name: "Permanently delete" }))

    expect(
      await screen.findByText(
        "The organization could not be deleted. Try again. If the problem continues, contact support. Reference ID: req_delete_01"
      )
    ).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
