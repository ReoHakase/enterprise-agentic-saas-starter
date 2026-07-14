import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConsoleApiError } from "@/features/console/api"
import type {
  InvitationFormValues,
  OrganizationInvitation,
  OrganizationMember,
} from "@/features/members/schema"
import type {
  OrganizationDetail,
  OrganizationRole,
} from "@/features/organizations/schema"

import { MembersPanel } from "./members-panel"

type UpdateMemberRole = (
  organizationId: string,
  memberId: string,
  role: Exclude<OrganizationRole, "super_admin">
) => Promise<unknown>
type TransferSuperAdmin = (
  organizationId: string,
  input: { memberId: string; confirmation: string }
) => Promise<unknown>
type CreateInvitation = (
  organizationId: string,
  input: InvitationFormValues
) => Promise<unknown>
type RemoveMember = (
  organizationId: string,
  memberId: string,
  confirmation: string
) => Promise<unknown>
type CancelInvitation = (
  organizationId: string,
  invitationId: string
) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  cancelInvitation: vi.fn<CancelInvitation>(),
  createInvitation: vi.fn<CreateInvitation>(),
  refresh: vi.fn<() => void>(),
  removeMember: vi.fn<RemoveMember>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  transferSuperAdmin: vi.fn<TransferSuperAdmin>(),
  updateMemberRole: vi.fn<UpdateMemberRole>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: {
    cancelInvitation: mocks.cancelInvitation,
    createInvitation: mocks.createInvitation,
    removeMember: mocks.removeMember,
    transferSuperAdmin: mocks.transferSuperAdmin,
    updateMemberRole: mocks.updateMemberRole,
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
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
  invitationCount: 1,
  memberCount: 3,
  memberAvatars: [],
  permissions: {
    canEditOrganization: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageAdmins: true,
    canTransferSuperAdmin: true,
  },
}

const members: OrganizationMember[] = [
  {
    id: "member-owner",
    userId: "user-owner",
    name: "Current Owner",
    email: "owner@example.com",
    image: null,
    role: "super_admin",
    createdAt: "2026-07-14T00:00:00.000Z",
  },
  {
    id: "member-admin",
    userId: "user-admin",
    name: "Target Admin",
    email: "admin@example.com",
    image: null,
    role: "admin",
    createdAt: "2026-07-14T00:00:00.000Z",
  },
  {
    id: "member-basic",
    userId: "user-basic",
    name: "Basic Member",
    email: "member@example.com",
    image: null,
    role: "member",
    createdAt: "2026-07-14T00:00:00.000Z",
  },
]

const invitations: OrganizationInvitation[] = [
  {
    id: "invitation-1",
    email: "pending@example.com",
    role: "member",
    status: "pending",
    organizationId: organization.id,
    inviterId: "user-owner",
    expiresAt: "2026-07-21T00:00:00.000Z",
    createdAt: "2026-07-14T00:00:00.000Z",
  },
]

const renderMembers = (
  value: OrganizationDetail = organization,
  memberValues = members,
  invitationValues = invitations
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MembersPanel
        organization={value}
        members={memberValues}
        invitations={invitationValues}
      />
    </QueryClientProvider>
  )
}

const chooseRole = async (
  user: ReturnType<typeof userEvent.setup>,
  memberName: string,
  roleName: string
) => {
  await user.click(
    screen.getByRole("combobox", { name: `Role for ${memberName}` })
  )
  await user.click(await screen.findByRole("option", { name: roleName }))
}

describe("MembersPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cancelInvitation.mockResolvedValue({})
    mocks.createInvitation.mockResolvedValue({})
    mocks.removeMember.mockResolvedValue({})
    mocks.transferSuperAdmin.mockResolvedValue(members)
    mocks.updateMemberRole.mockResolvedValue(members)
  })

  it("keeps invitation values and renders a safe API field error", async () => {
    const user = userEvent.setup()
    mocks.createInvitation.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "invitation_exists",
        fieldErrors: { email: ["This address already has an invitation."] },
        message: "Invitation could not be created",
        status: 409,
      })
    )
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Invite member" }))
    const email = screen.getByRole("textbox", { name: "Email" })
    await user.type(email, "pending@example.com")
    await user.click(screen.getByRole("button", { name: "Send invitation" }))

    expect(
      await screen.findByText("This address already has an invitation.")
    ).toBeInTheDocument()
    expect(email).toHaveValue("pending@example.com")
    expect(mocks.createInvitation).toHaveBeenCalledWith(organization.id, {
      email: "pending@example.com",
      role: "member",
    })
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it("retains the ownership confirmation across a step-up challenge", async () => {
    const user = userEvent.setup()
    mocks.transferSuperAdmin.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "step_up_required",
        context: {
          action: "organization.transfer_super_admin",
          maxAgeSeconds: 600,
        },
        message: "Recent authentication required",
        status: 403,
      })
    )
    renderMembers()

    await chooseRole(user, "Target Admin", "Super Admin")
    const confirmation = screen.getByRole("textbox", {
      name: "Member email",
    })
    await user.type(confirmation, "admin@example.com")
    await user.click(
      screen.getByRole("button", { name: "Transfer Super Admin" })
    )

    expect(
      await screen.findByRole("heading", { name: "Confirm it is really you" })
    ).toBeInTheDocument()
    expect(confirmation).toHaveValue("admin@example.com")
    expect(mocks.transferSuperAdmin).toHaveBeenCalledWith(organization.id, {
      memberId: "member-admin",
      confirmation: "admin@example.com",
    })

    await user.click(screen.getByRole("button", { name: "Not now" }))
    expect(confirmation).toHaveValue("admin@example.com")
  })

  it("validates removal locally and shows server field errors below the input", async () => {
    const user = userEvent.setup()
    mocks.removeMember.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "confirmation_mismatch",
        fieldErrors: { confirmation: ["Confirmation is no longer valid."] },
        message: "Confirmation mismatch",
        status: 400,
      })
    )
    renderMembers()

    await user.click(
      screen.getByRole("button", { name: "Remove Basic Member" })
    )
    const confirmation = screen.getByRole("textbox", {
      name: "Member email",
    })
    await user.type(confirmation, "wrong@example.com")
    await user.click(screen.getByRole("button", { name: "Remove member" }))

    expect(
      await screen.findByText(
        "Type member@example.com exactly to remove this member."
      )
    ).toBeInTheDocument()
    expect(mocks.removeMember).not.toHaveBeenCalled()

    await user.clear(confirmation)
    await user.type(confirmation, "member@example.com")
    await user.click(screen.getByRole("button", { name: "Remove member" }))

    expect(
      await screen.findByText("Confirmation is no longer valid.")
    ).toBeInTheDocument()
    expect(confirmation).toHaveValue("member@example.com")
    expect(mocks.removeMember).toHaveBeenCalledWith(
      organization.id,
      "member-basic",
      "member@example.com"
    )
  })

  it("updates editable roles and cancels pending invitations from the table flow", async () => {
    const user = userEvent.setup()
    renderMembers()

    await chooseRole(user, "Basic Member", "Admin")
    await waitFor(() => {
      expect(mocks.updateMemberRole).toHaveBeenCalledWith(
        organization.id,
        "member-basic",
        "admin"
      )
    })

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(
      await screen.findByRole("button", { name: "Cancel invitation" })
    )
    await waitFor(() => {
      expect(mocks.cancelInvitation).toHaveBeenCalledWith(
        organization.id,
        "invitation-1"
      )
    })
  })
})
