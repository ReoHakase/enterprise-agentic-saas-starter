import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConsoleApiError } from "@/features/console"
import type {
  OrganizationDetail,
  OrganizationRole,
} from "@/features/organizations"

import type {
  BulkInvitationInput,
  OrganizationInvitation,
  OrganizationMember,
} from "../../schema"
import { MembersPanel } from "./members-panel"

type BulkInvitationResponse = {
  invitations: OrganizationInvitation[]
  queuedCount: number
  delivery: "queued"
}
type ResendInvitationResponse = {
  invitation: OrganizationInvitation
  delivery: "queued"
  revived: boolean
}

type UpdateMemberRole = (
  organizationId: string,
  memberId: string,
  role: Exclude<OrganizationRole, "super_admin">
) => Promise<unknown>
type TransferSuperAdmin = (
  organizationId: string,
  input: { memberId: string; confirmation: string }
) => Promise<unknown>
type CreateInvitations = (
  organizationId: string,
  input: BulkInvitationInput
) => Promise<BulkInvitationResponse>
type RemoveMember = (
  organizationId: string,
  memberId: string,
  confirmation: string
) => Promise<unknown>
type CancelInvitation = (
  organizationId: string,
  invitationId: string
) => Promise<unknown>
type ResendInvitation = (
  organizationId: string,
  invitationId: string
) => Promise<ResendInvitationResponse>

const mocks = vi.hoisted(() => ({
  cancelInvitation: vi.fn<CancelInvitation>(),
  createInvitations: vi.fn<CreateInvitations>(),
  refresh: vi.fn<() => void>(),
  removeMember: vi.fn<RemoveMember>(),
  resendInvitation: vi.fn<ResendInvitation>(),
  toastError: vi.fn<(message: string, options?: unknown) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  transferSuperAdmin: vi.fn<TransferSuperAdmin>(),
  updateMemberRole: vi.fn<UpdateMemberRole>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: {
    cancelInvitation: mocks.cancelInvitation,
    createInvitations: mocks.createInvitations,
    removeMember: mocks.removeMember,
    resendInvitation: mocks.resendInvitation,
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
  profileImage: null,
  role: "super_admin",
  active: true,
  createdAt: "2026-07-14T00:00:00.000Z",
  invitationCount: 1,
  memberCount: 3,
  memberProfileImages: [],
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
    profileImage: null,
    role: "super_admin",
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "member-admin",
    userId: "user-admin",
    name: "Target Admin",
    email: "admin@example.com",
    profileImage: null,
    role: "admin",
    createdAt: "2026-07-02T00:00:00.000Z",
  },
  {
    id: "member-basic",
    userId: "user-basic",
    name: "Basic Member",
    email: "member@example.com",
    profileImage: null,
    role: "member",
    createdAt: "2026-07-03T00:00:00.000Z",
  },
]

const pendingInvitation: OrganizationInvitation = {
  id: "invitation-1",
  email: "pending@example.com",
  role: "member",
  status: "pending",
  organizationId: organization.id,
  inviterId: "user-owner",
  inviter: {
    id: "user-owner",
    name: "Current Owner",
    email: "owner@example.com",
    profileImage: null,
  },
  expiresAt: "2026-07-21T00:00:00.000Z",
  createdAt: "2026-07-14T00:00:00.000Z",
}

const expiredInvitation: OrganizationInvitation = {
  id: "invitation-expired",
  email: "expired@example.com",
  role: "member",
  status: "expired",
  organizationId: organization.id,
  inviterId: "user-admin",
  inviter: {
    id: "user-admin",
    name: "Target Admin",
    email: "admin@example.com",
    profileImage: null,
  },
  expiresAt: "2026-07-12T00:00:00.000Z",
  createdAt: "2026-07-10T00:00:00.000Z",
}

const invitations: OrganizationInvitation[] = [
  pendingInvitation,
  expiredInvitation,
]

const bulkInvitationResult = (
  emails: string[],
  role: "admin" | "member" = "member"
): BulkInvitationResponse => ({
  invitations: emails.map((email, index) => ({
    id: `created-invitation-${index + 1}`,
    email,
    role,
    status: "pending",
    organizationId: organization.id,
    inviterId: "user-owner",
    inviter: {
      id: "user-owner",
      name: "Current Owner",
      email: "owner@example.com",
      profileImage: null,
    },
    expiresAt: "2026-07-21T00:00:00.000Z",
    createdAt: "2026-07-14T00:00:00.000Z",
  })),
  queuedCount: emails.length,
  delivery: "queued",
})

const resendInvitationResult = (
  invitation: OrganizationInvitation,
  revived: boolean
): ResendInvitationResponse => ({
  invitation: {
    ...invitation,
    status: "pending",
    expiresAt: "2026-07-23T00:00:00.000Z",
  },
  delivery: "queued",
  revived,
})

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
    mocks.createInvitations.mockResolvedValue(
      bulkInvitationResult(["new@example.com"])
    )
    mocks.removeMember.mockResolvedValue({})
    mocks.resendInvitation.mockResolvedValue(
      resendInvitationResult(pendingInvitation, false)
    )
    mocks.transferSuperAdmin.mockResolvedValue(members)
    mocks.updateMemberRole.mockResolvedValue(members)
  })

  it("searches members by name and email and sorts user, role, and joined columns", async () => {
    const user = userEvent.setup()
    renderMembers()
    const table = screen.getByRole("table", { name: "Members of Acme" })

    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Basic Member"
    )
    expect(within(table).getByText("Jul 1, 2026")).toBeInTheDocument()

    const search = screen.getByRole("searchbox", {
      name: "Search members by name or email",
    })
    await user.type(search, "admin@example.com")
    expect(within(table).getAllByRole("row")).toHaveLength(2)
    expect(within(table).getByText("Target Admin")).toBeInTheDocument()
    expect(within(table).queryByText("Basic Member")).not.toBeInTheDocument()

    await user.clear(search)
    await user.click(
      within(table).getByRole("button", { name: "Sort by joined" })
    )
    await user.click(
      within(table).getByRole("button", {
        name: "Sort by joined, currently ascending",
      })
    )
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Basic Member"
    )

    await user.click(
      within(table).getByRole("button", { name: "Sort by role" })
    )
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Current Owner"
    )
  }, 10_000)

  it("shows sortable invitation lifecycle and inviter details", async () => {
    const user = userEvent.setup()
    renderMembers()
    const table = screen.getByRole("table", { name: "Invitations for Acme" })

    expect(within(table).getByText("pending@example.com")).toBeInTheDocument()
    expect(within(table).getByText("expired@example.com")).toBeInTheDocument()
    expect(within(table).getByText("Current Owner")).toBeInTheDocument()
    expect(within(table).getByText("owner@example.com")).toBeInTheDocument()
    expect(within(table).getByText("Jul 21, 2026")).toBeInTheDocument()
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "pending@example.com"
    )

    await user.click(
      within(table).getByRole("button", {
        name: "Sort by created, currently descending",
      })
    )
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "expired@example.com"
    )
  })

  it("does not imply an empty invitation list to users without access", () => {
    renderMembers({
      ...organization,
      role: "member",
      permissions: {
        canEditOrganization: false,
        canInviteMembers: false,
        canManageMembers: false,
        canManageAdmins: false,
        canTransferSuperAdmin: false,
      },
    })

    expect(
      screen.queryByRole("heading", { name: "Invitations" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("No invitations")).not.toBeInTheDocument()
  })

  it("resends pending invitations and renews expired invitations", async () => {
    const user = userEvent.setup()
    mocks.resendInvitation
      .mockResolvedValueOnce(resendInvitationResult(pendingInvitation, false))
      .mockResolvedValueOnce(resendInvitationResult(expiredInvitation, true))
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Resend" }))
    await waitFor(() => {
      expect(mocks.resendInvitation).toHaveBeenCalledWith(
        organization.id,
        "invitation-1"
      )
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Invitation email queued again"
    )

    await user.click(screen.getByRole("button", { name: "Renew & resend" }))
    await waitFor(() => {
      expect(mocks.resendInvitation).toHaveBeenCalledWith(
        organization.id,
        "invitation-expired"
      )
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Invitation renewed and queued"
    )
  })

  it("does not offer renewal when the recipient already has an active invitation", () => {
    renderMembers(organization, members, [
      pendingInvitation,
      {
        ...expiredInvitation,
        id: "invitation-expired-duplicate",
        email: pendingInvitation.email,
      },
    ])

    const duplicateRow = screen
      .getAllByRole("row")
      .find((row) => within(row).queryByText("Active invitation exists"))
    expect(duplicateRow).toBeDefined()
    if (!duplicateRow) throw new Error("Expected duplicate invitation row")
    expect(
      within(duplicateRow).getByText("Active invitation exists")
    ).toBeVisible()
    expect(
      within(duplicateRow).queryByRole("button", { name: "Renew & resend" })
    ).not.toBeInTheDocument()
  })

  it("shows a safe resend failure toast and keeps the action available", async () => {
    const user = userEvent.setup()
    mocks.resendInvitation.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "invitation_not_resendable",
        message: "Invitation is no longer resendable",
        status: 409,
      })
    )
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Resend" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Invitation is no longer resendable",
        undefined
      )
    })
    expect(screen.getByRole("button", { name: "Resend" })).toBeEnabled()
  })

  it("normalizes comma and newline separated emails, removes duplicates, and reports the queued count", async () => {
    const user = userEvent.setup()
    mocks.createInvitations.mockResolvedValueOnce(
      bulkInvitationResult(["first@example.com", "second@example.com"])
    )
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Invite members" }))
    await user.type(
      screen.getByRole("textbox", { name: "Email addresses" }),
      "First@Example.com, second@example.com\nfirst@example.com"
    )
    await user.click(screen.getByRole("button", { name: "Send invitations" }))

    await waitFor(() => {
      expect(mocks.createInvitations).toHaveBeenCalledWith(organization.id, {
        emails: ["first@example.com", "second@example.com"],
        role: "member",
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("2 invitations queued")
    expect(
      screen.queryByRole("dialog", { name: "Invite members" })
    ).not.toBeInTheDocument()
  })

  it("blocks malformed bulk email input without making a request", async () => {
    const user = userEvent.setup()
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Invite members" }))
    const emails = screen.getByRole("textbox", { name: "Email addresses" })
    await user.type(emails, "valid@example.com, not-an-email")
    await user.click(screen.getByRole("button", { name: "Send invitations" }))

    expect(
      await screen.findByText(
        "Enter valid email addresses separated by commas or new lines."
      )
    ).toBeInTheDocument()
    expect(emails).toHaveAttribute("aria-invalid", "true")
    expect(emails).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("invitation-emails-local-error")
    )
    expect(emails).toHaveValue("valid@example.com, not-an-email")
    expect(mocks.createInvitations).not.toHaveBeenCalled()
  })

  it("keeps invitation values and renders a safe 409 field error", async () => {
    const user = userEvent.setup()
    mocks.createInvitations.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "invitation_exists",
        fieldErrors: { emails: ["An address already has an invitation."] },
        message: "Invitation could not be created",
        status: 409,
      })
    )
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Invite members" }))
    const emails = screen.getByRole("textbox", { name: "Email addresses" })
    await user.type(emails, "pending@example.com, next@example.com")
    await user.click(screen.getByRole("button", { name: "Send invitations" }))

    expect(
      await screen.findByText("An address already has an invitation.")
    ).toBeInTheDocument()
    expect(emails).toHaveAttribute("aria-invalid", "true")
    expect(emails).toHaveValue("pending@example.com, next@example.com")
    expect(mocks.createInvitations).toHaveBeenCalledWith(organization.id, {
      emails: ["pending@example.com", "next@example.com"],
      role: "member",
    })
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it("keeps bulk input after a safe 429 response and clears the error on edit", async () => {
    const user = userEvent.setup()
    mocks.createInvitations.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "rate_limited",
        context: { retryAfter: 30 },
        message: "Too many invitation requests",
        status: 429,
      })
    )
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Invite members" }))
    const emails = screen.getByRole("textbox", { name: "Email addresses" })
    await user.type(emails, "first@example.com\nsecond@example.com")
    await user.click(screen.getByRole("button", { name: "Send invitations" }))

    expect(
      await screen.findByText(
        "Too many invitation requests Try again in 30 seconds."
      )
    ).toBeInTheDocument()
    expect(emails).toHaveValue("first@example.com\nsecond@example.com")
    expect(emails).toHaveAttribute("aria-invalid", "false")
    expect(mocks.toastError).not.toHaveBeenCalled()

    await user.type(emails, ", third@example.com")
    expect(
      screen.queryByText(
        "Too many invitation requests Try again in 30 seconds."
      )
    ).not.toBeInTheDocument()
  })

  it("keeps bulk input while step-up is handled only by the confirmation dialog", async () => {
    const user = userEvent.setup()
    mocks.createInvitations.mockRejectedValueOnce(
      new ConsoleApiError({
        code: "step_up_required",
        context: {
          action: "organization.invite_members",
          maxAgeSeconds: 600,
        },
        message: "Recent authentication required",
        status: 403,
      })
    )
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Invite members" }))
    const emails = screen.getByRole("textbox", { name: "Email addresses" })
    await user.type(emails, "first@example.com, second@example.com")
    await user.click(screen.getByRole("button", { name: "Send invitations" }))

    expect(
      await screen.findByRole("heading", { name: "Confirm it is really you" })
    ).toBeInTheDocument()
    expect(emails).toHaveValue("first@example.com, second@example.com")
    expect(
      screen.queryByText("Recent authentication required")
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Not now" }))
    expect(emails).toHaveValue("first@example.com, second@example.com")
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
