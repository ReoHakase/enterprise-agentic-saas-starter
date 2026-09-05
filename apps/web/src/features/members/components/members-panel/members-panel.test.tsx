import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  OrganizationDetail,
  OrganizationRole,
} from "@/features/organizations"
import { httpError } from "@/test-support/http-error"

import type { OrganizationInvitation, OrganizationMember } from "../../schema"
import { MembersPanel } from "./members-panel"

type UpdateMemberRole = (
  organizationId: string,
  memberId: string,
  role: Exclude<OrganizationRole, "owner">
) => Promise<unknown>
type TransferOwnership = (
  organizationId: string,
  input: { memberId: string; confirmation: string }
) => Promise<unknown>
type SendOrganizationInvitation = (input: {
  apiBaseUrl: string
  email: string
  organizationId: string
  resend?: boolean
  role: "admin" | "member"
}) => Promise<unknown>
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
  routerInvalidate: vi.fn<() => void>(),
  removeMember: vi.fn<RemoveMember>(),
  sendOrganizationInvitation: vi.fn<SendOrganizationInvitation>(),
  toastError: vi.fn<(message: string, options?: unknown) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  transferOwnership: vi.fn<TransferOwnership>(),
  updateMemberRole: vi.fn<UpdateMemberRole>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: {
    cancelInvitation: mocks.cancelInvitation,
    removeMember: mocks.removeMember,
    transferOwnership: mocks.transferOwnership,
    updateMemberRole: mocks.updateMemberRole,
  },
}))

vi.mock("../../api", () => ({
  sendOrganizationInvitation: mocks.sendOrganizationInvitation,
}))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
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
  role: "owner",
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
    canTransferOwnership: true,
  },
}

const members: OrganizationMember[] = [
  {
    id: "member-owner",
    userId: "user-owner",
    name: "Current Owner",
    email: "owner@example.com",
    profileImage: null,
    githubLinked: true,
    passkeyLinked: true,
    role: "owner",
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "member-admin",
    userId: "user-admin",
    name: "Target Admin",
    email: "admin@example.com",
    profileImage: null,
    githubLinked: true,
    passkeyLinked: false,
    role: "admin",
    createdAt: "2026-07-02T00:00:00.000Z",
  },
  {
    id: "member-basic",
    userId: "user-basic",
    name: "Basic Member",
    email: "member@example.com",
    profileImage: null,
    githubLinked: false,
    passkeyLinked: true,
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

const acceptedInvitation: OrganizationInvitation = {
  ...pendingInvitation,
  id: "invitation-accepted",
  email: "accepted@example.com",
  role: "admin",
  status: "accepted",
  createdAt: "2026-07-09T00:00:00.000Z",
}

const rejectedInvitation: OrganizationInvitation = {
  ...pendingInvitation,
  id: "invitation-rejected",
  email: "rejected@example.com",
  status: "rejected",
  createdAt: "2026-07-08T00:00:00.000Z",
}

const canceledInvitation: OrganizationInvitation = {
  ...pendingInvitation,
  id: "invitation-canceled",
  email: "canceled@example.com",
  role: "admin",
  status: "canceled",
  createdAt: "2026-07-07T00:00:00.000Z",
}

const invitations: OrganizationInvitation[] = [
  pendingInvitation,
  expiredInvitation,
  acceptedInvitation,
  rejectedInvitation,
  canceledInvitation,
]

const invitationEmailOrders = {
  createdDescending: [
    "pending@example.com",
    "expired@example.com",
    "accepted@example.com",
    "rejected@example.com",
    "canceled@example.com",
  ],
  createdAscending: [
    "canceled@example.com",
    "rejected@example.com",
    "accepted@example.com",
    "expired@example.com",
    "pending@example.com",
  ],
  statusAscending: [
    "pending@example.com",
    "expired@example.com",
    "accepted@example.com",
    "rejected@example.com",
    "canceled@example.com",
  ],
  statusDescending: [
    "canceled@example.com",
    "rejected@example.com",
    "accepted@example.com",
    "expired@example.com",
    "pending@example.com",
  ],
  roleAscending: [
    "accepted@example.com",
    "canceled@example.com",
    "pending@example.com",
    "expired@example.com",
    "rejected@example.com",
  ],
} as const

const getInvitationEmailOrder = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map(
      (row) =>
        invitations.find((invitation) =>
          within(row).queryByText(invitation.email)
        )?.email
    )

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
    <NuqsTestingAdapter hasMemory>
      <QueryClientProvider client={queryClient}>
        <MembersPanel
          organization={value}
          members={memberValues}
          invitations={invitationValues}
        />
      </QueryClientProvider>
    </NuqsTestingAdapter>
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

describe("MembersPanelの契約", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cancelInvitation.mockResolvedValue({})
    mocks.removeMember.mockResolvedValue({})
    mocks.sendOrganizationInvitation.mockResolvedValue({})
    mocks.transferOwnership.mockResolvedValue(members)
    mocks.updateMemberRole.mockResolvedValue(members)
  })

  it("メンバー一覧へ連携状態と権限と参加日を表示する", () => {
    renderMembers()
    const table = screen.getByRole("table", { name: "Members of Acme" })

    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
    ).toEqual(["Member", "GitHub", "Passkey", "Joined", "Role", "Actions"])
    expect(
      within(table).getByRole("img", {
        name: "Current Owner has GitHub linked",
      })
    ).toBeVisible()
    expect(
      within(table).getByRole("img", {
        name: "Basic Member has a passkey linked",
      })
    ).toBeVisible()
    expect(
      within(table).queryByRole("img", {
        name: "Basic Member has GitHub linked",
      })
    ).not.toBeInTheDocument()
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Basic Member"
    )
    expect(within(table).getByText("Jul 1, 2026")).toBeInTheDocument()
  })

  it.each([
    { caseLabel: "名前", query: "Target Admin" },
    { caseLabel: "メールアドレス", query: "admin@example.com" },
  ])("$caseLabelで対象メンバーを絞り込む", async ({ query }) => {
    const user = userEvent.setup()
    renderMembers()
    const table = screen.getByRole("table", { name: "Members of Acme" })
    const search = screen.getByRole("searchbox", {
      name: "Search members by name or email",
    })

    await user.type(search, query)
    expect(within(table).getAllByRole("row")).toHaveLength(2)
    expect(within(table).getByText("Target Admin")).toBeInTheDocument()
    expect(within(table).queryByText("Basic Member")).not.toBeInTheDocument()
  })

  it("参加日を昇順へ並べ替える", async () => {
    const user = userEvent.setup()
    renderMembers()
    const table = screen.getByRole("table", { name: "Members of Acme" })

    await user.click(
      within(table).getByRole("button", { name: "Sort by joined" })
    )
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Current Owner"
    )
  })

  it("権限の優先順位でメンバーを並べ替える", async () => {
    const user = userEvent.setup()
    renderMembers()
    const table = screen.getByRole("table", { name: "Members of Acme" })

    await user.click(
      within(table).getByRole("button", { name: "Sort by role" })
    )
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Current Owner"
    )
  })

  it("招待一覧へ状態と招待者と期限を表示する", () => {
    renderMembers()
    const table = screen.getByRole("table", { name: "Invitations for Acme" })

    expect(within(table).getByText("pending@example.com")).toBeInTheDocument()
    expect(within(table).getByText("expired@example.com")).toBeInTheDocument()
    expect(within(table).getAllByText("Current Owner")).toHaveLength(4)
    expect(within(table).getAllByText("owner@example.com")).toHaveLength(4)
    const pendingRow = within(table)
      .getAllByRole("row")
      .find((row) => within(row).queryByText("pending@example.com"))
    expect(pendingRow).toBeDefined()
    if (!pendingRow) throw new Error("Expected pending invitation row")
    expect(within(pendingRow).getByText("Jul 21, 2026")).toBeInTheDocument()
  })

  it("招待を作成日の降順で初期表示する", () => {
    renderMembers()
    const table = screen.getByRole("table", { name: "Invitations for Acme" })

    expect(getInvitationEmailOrder(table)).toEqual(
      invitationEmailOrders.createdDescending
    )
  })

  it("招待の作成日を昇順へ切り替える", async () => {
    const user = userEvent.setup()
    renderMembers()
    const table = screen.getByRole("table", { name: "Invitations for Acme" })

    await user.click(
      within(table).getByRole("button", {
        name: "Sort by created, currently descending",
      })
    )
    expect(getInvitationEmailOrder(table)).toEqual(
      invitationEmailOrders.createdAscending
    )
  })

  it("招待状態を昇順へ並べ替える", async () => {
    const user = userEvent.setup()
    renderMembers()
    const table = screen.getByRole("table", { name: "Invitations for Acme" })

    await user.click(
      within(table).getByRole("button", { name: "Sort by status" })
    )
    expect(getInvitationEmailOrder(table)).toEqual(
      invitationEmailOrders.statusAscending
    )
  })

  it("招待権限の優先順位で並べ替える", async () => {
    const user = userEvent.setup()
    renderMembers()
    const table = screen.getByRole("table", { name: "Invitations for Acme" })

    await user.click(
      within(table).getByRole("button", { name: "Sort by role" })
    )
    expect(getInvitationEmailOrder(table)).toEqual(
      invitationEmailOrders.roleAscending
    )
  })

  it("権限のない利用者へ空の招待一覧があるように見せない", () => {
    renderMembers({
      ...organization,
      role: "member",
      permissions: {
        canEditOrganization: false,
        canInviteMembers: false,
        canManageMembers: false,
        canManageAdmins: false,
        canTransferOwnership: false,
      },
    })

    expect(
      screen.queryByRole("heading", { name: "Invitations" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("No invitations")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /More actions for/u })
    ).not.toBeInTheDocument()
  })

  it("削除を許可せず保留中の操作を無効として扱う", async () => {
    const user = userEvent.setup()
    mocks.updateMemberRole.mockImplementationOnce(
      () => new Promise(() => undefined)
    )
    renderMembers()

    await chooseRole(user, "Basic Member", "Admin")
    const actionTrigger = screen.getByRole("button", {
      name: "More actions for Basic Member",
    })
    expect(actionTrigger).not.toBeDisabled()
    expect(actionTrigger).toHaveAttribute("aria-disabled", "true")
    expect(actionTrigger).toHaveAttribute("aria-busy", "true")

    await user.click(actionTrigger)
    const removeItem = await screen.findByRole("menuitem", {
      name: "Remove member",
    })
    await user.click(removeItem)

    expect(mocks.removeMember).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("textbox", { name: "Member email" })
    ).not.toBeInTheDocument()
  })

  it.each([
    { caseLabel: "管理者", memberName: "Target Admin" },
    { caseLabel: "所有者", memberName: "Current Owner" },
  ])("$caseLabelを管理者から削除できない", async ({ memberName }) => {
    const user = userEvent.setup()
    renderMembers({
      ...organization,
      role: "admin",
      permissions: {
        ...organization.permissions,
        canEditOrganization: false,
        canManageAdmins: false,
        canTransferOwnership: false,
      },
    })

    await user.click(
      screen.getByRole("button", {
        name: `More actions for ${memberName}`,
      })
    )
    const removeItem = await screen.findByRole("menuitem", {
      name: "Remove member",
    })
    await user.click(removeItem)
    expect(mocks.removeMember).not.toHaveBeenCalled()
  })

  it("保留中の招待をBetter Authで再送信する", async () => {
    const user = userEvent.setup()
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Resend" }))
    await waitFor(() => {
      expect(mocks.sendOrganizationInvitation).toHaveBeenCalledWith({
        apiBaseUrl: expect.any(String),
        email: "pending@example.com",
        organizationId: organization.id,
        resend: true,
        role: "member",
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Invitation resent")
  })

  it("期限切れの招待をBetter Authで更新して再送信する", async () => {
    const user = userEvent.setup()
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Renew & resend" }))
    await waitFor(() => {
      expect(mocks.sendOrganizationInvitation).toHaveBeenCalledWith({
        apiBaseUrl: expect.any(String),
        email: "expired@example.com",
        organizationId: organization.id,
        resend: true,
        role: "member",
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Invitation resent")
  })

  it("受信者に有効な招待がある場合は更新を提示しない", () => {
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

  it("安全な再送信失敗toastを表示し、操作を利用可能に保つ", async () => {
    const user = userEvent.setup()
    mocks.sendOrganizationInvitation.mockRejectedValueOnce(
      httpError(409, "conflict")
    )
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Resend" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "The invitation could not be resent.",
        undefined
      )
    })
    expect(screen.getByRole("button", { name: "Resend" })).toBeEnabled()
  })

  it("Better Authで正規化済みの招待を1件送信する", async () => {
    const user = userEvent.setup()
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Invite member" }))
    const email = screen.getByRole("textbox", { name: "Email address" })
    await user.type(email, " First@Example.com ")
    await user.click(screen.getByRole("button", { name: "Send invitation" }))

    await waitFor(() => {
      expect(mocks.sendOrganizationInvitation).toHaveBeenCalledWith({
        apiBaseUrl: expect.any(String),
        email: "first@example.com",
        organizationId: organization.id,
        role: "member",
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Invitation sent")
    expect(
      screen.queryByRole("dialog", { name: "Invite member" })
    ).not.toBeInTheDocument()
  })

  it("リクエストせず形式不正のメールアドレスを拒否する", async () => {
    const user = userEvent.setup()
    renderMembers()

    await user.click(screen.getByRole("button", { name: "Invite member" }))
    const email = screen.getByRole("textbox", { name: "Email address" })
    await user.type(email, "not-an-email")
    await user.click(screen.getByRole("button", { name: "Send invitation" }))

    expect(
      await screen.findByText("Enter a valid email address.")
    ).toBeVisible()
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(mocks.sendOrganizationInvitation).not.toHaveBeenCalled()
  })

  it("step-up challengeをまたいでOwner確認を保持する", async () => {
    const user = userEvent.setup()
    mocks.transferOwnership.mockRejectedValueOnce(
      httpError(403, "step_up_required")
    )
    renderMembers()

    await chooseRole(user, "Target Admin", "Owner")
    const confirmation = screen.getByRole("textbox", {
      name: "Member email",
    })
    await user.type(confirmation, "admin@example.com")
    await user.click(screen.getByRole("button", { name: "Transfer ownership" }))

    expect(
      await screen.findByRole("heading", { name: "Confirm it is really you" })
    ).toBeInTheDocument()
    expect(confirmation).toHaveValue("admin@example.com")
    expect(mocks.transferOwnership).toHaveBeenCalledWith(organization.id, {
      memberId: "member-admin",
      confirmation: "admin@example.com",
    })

    await user.click(screen.getByRole("button", { name: "Not now" }))
    expect(confirmation).toHaveValue("admin@example.com")
  })

  it("一致しない確認メールアドレスは削除要求前に拒否する", async () => {
    const user = userEvent.setup()
    renderMembers()

    await user.click(
      screen.getByRole("button", { name: "More actions for Basic Member" })
    )
    await user.click(screen.getByRole("menuitem", { name: "Remove member" }))
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
  })

  it("メンバー削除のサーバー障害には固定の安全な文言を表示する", async () => {
    const user = userEvent.setup()
    mocks.removeMember.mockRejectedValueOnce(
      httpError(400, "confirmation_required")
    )
    renderMembers()

    await user.click(
      screen.getByRole("button", { name: "More actions for Basic Member" })
    )
    await user.click(screen.getByRole("menuitem", { name: "Remove member" }))
    const confirmation = screen.getByRole("textbox", {
      name: "Member email",
    })

    await user.type(confirmation, "member@example.com")
    await user.click(screen.getByRole("button", { name: "Remove member" }))

    expect(
      await screen.findByText("The member could not be removed.")
    ).toBeVisible()
    expect(confirmation).toHaveValue("member@example.com")
    expect(mocks.removeMember).toHaveBeenCalledWith(
      organization.id,
      "member-basic",
      "member@example.com"
    )
  })

  it("編集可能なメンバーの権限を更新する", async () => {
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
  })

  it("保留中の招待を一覧からキャンセルする", async () => {
    const user = userEvent.setup()
    renderMembers()

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
