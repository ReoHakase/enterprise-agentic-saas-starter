import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OrganizationDetail } from "@/features/organizations/schema"
import { ConsoleApiError } from "@/lib/console-api"

import { OrganizationSettingsForm } from "./organization-settings-form"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn<() => void>(),
  replace: vi.fn<(href: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  updateOrganization:
    vi.fn<(organizationId: string, input: unknown) => Promise<unknown>>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: { updateOrganization: mocks.updateOrganization },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}))

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess },
}))

vi.mock("./organization-danger-zone", () => ({
  OrganizationDangerZone: () => <div>Danger zone placeholder</div>,
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

const renderSettings = () => {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <OrganizationSettingsForm organization={organization} />
    </QueryClientProvider>
  )
}

describe("OrganizationSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateOrganization.mockResolvedValue(organization)
  })

  it("updates organization identity through a query mutation", async () => {
    const actor = userEvent.setup()
    mocks.updateOrganization.mockResolvedValue({
      ...organization,
      name: "Acme Operations",
    })
    renderSettings()

    const name = screen.getByLabelText("Name")
    await actor.clear(name)
    await actor.type(name, "Acme Operations")
    await actor.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(mocks.updateOrganization).toHaveBeenCalledWith(organization.id, {
        name: "Acme Operations",
        slug: organization.slug,
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Organization updated")
  })

  it("shows a slug error below the input and retains the draft", async () => {
    const actor = userEvent.setup()
    mocks.updateOrganization.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "validation_failed",
        fieldErrors: { slug: ["This slug is already in use."] },
        message: "Fix the highlighted field.",
        status: 409,
      })
    )
    renderSettings()

    const slug = screen.getByLabelText("Slug")
    await actor.clear(slug)
    await actor.type(slug, "acme-new")
    await actor.click(screen.getByRole("button", { name: "Save changes" }))

    expect(
      await screen.findByText("This slug is already in use.")
    ).toBeInTheDocument()
    expect(slug).toHaveValue("acme-new")
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

  it("replaces the settings URL after a slug change", async () => {
    const actor = userEvent.setup()
    mocks.updateOrganization.mockResolvedValueOnce({
      ...organization,
      slug: "acme-operations",
    })
    renderSettings()

    const slug = screen.getByLabelText("Slug")
    await actor.clear(slug)
    await actor.type(slug, "acme-operations")
    await actor.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        "/organization/acme-operations/settings"
      )
    })
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
