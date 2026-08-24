import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { httpError } from "@/test-support/http-error"

import type { OrganizationDetail } from "../../schema"
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

vi.mock("../organization-danger-zone/organization-danger-zone", () => ({
  OrganizationDangerZone: () => <div>Danger zone placeholder</div>,
}))

const organization: OrganizationDetail = {
  id: "org-acme",
  name: "Acme",
  slug: "acme",
  profileImage: null,
  role: "owner",
  active: true,
  createdAt: "2026-07-14T00:00:00.000Z",
  invitationCount: 0,
  memberCount: 2,
  memberProfileImages: [],
  permissions: {
    canEditOrganization: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageAdmins: true,
    canTransferOwnership: true,
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

describe("OrganizationSettingsFormの契約", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateOrganization.mockResolvedValue(organization)
  })

  it("組織情報を更新して成功を通知する", async () => {
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

  it("固定の失敗文言を表示してdraftを保持する", async () => {
    const actor = userEvent.setup()
    mocks.updateOrganization.mockRejectedValueOnce(httpError(409, "conflict"))
    renderSettings()

    const slug = screen.getByLabelText("Slug")
    await actor.clear(slug)
    await actor.type(slug, "acme-new")
    await actor.click(screen.getByRole("button", { name: "Save changes" }))

    expect(
      await screen.findByText("The organization could not be updated.")
    ).toBeVisible()
    expect(slug).toHaveValue("acme-new")

    await actor.type(slug, "-edited")

    expect(
      screen.queryByText("The organization could not be updated.")
    ).not.toBeInTheDocument()
  })

  it("組織更新時にサーバー予約済みslugをAPIフィールドエラーとして表示する", async () => {
    const actor = userEvent.setup()
    mocks.updateOrganization.mockRejectedValueOnce(
      httpError(400, "validation_error", {
        fieldErrors: { slug: ["Choose another slug."] },
        message: "This organization slug is reserved.",
      })
    )
    renderSettings()

    const slug = screen.getByLabelText("Slug")
    await actor.clear(slug)
    await actor.type(slug, "auth")
    await actor.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(mocks.updateOrganization).toHaveBeenCalledWith(organization.id, {
        name: organization.name,
        slug: "auth",
      })
    })
    expect(await screen.findByText("Choose another slug.")).toBeVisible()
    expect(slug).toHaveAttribute("aria-invalid", "true")
    expect(
      screen.queryByText("The organization could not be updated.")
    ).not.toBeInTheDocument()

    await actor.type(slug, "-team")
    expect(screen.queryByText("Choose another slug.")).not.toBeInTheDocument()
  })

  it("slug変更後に設定URLを置き換える", async () => {
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
