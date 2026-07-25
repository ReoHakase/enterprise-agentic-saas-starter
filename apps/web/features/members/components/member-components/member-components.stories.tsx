import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import { Providers } from "@/components/providers/providers"
import type { OrganizationDetail } from "@/features/organizations"

import type { OrganizationInvitation, OrganizationMember } from "../../schema"
import { InvitationDecisionPanel } from "../invitation-decision-panel/invitation-decision-panel"
import { InvitationsSection } from "../invitations-section/invitations-section"
import { InviteMemberDialog } from "../invite-member-dialog/invite-member-dialog"
import {
  MemberConfirmationDialog,
  StepUpDialog,
} from "../member-confirmation-dialog/member-confirmation-dialog"
import { MembersPage } from "../members-page/members-page"
import { MembersPanel } from "../members-panel/members-panel"
import { MembersTable } from "../members-table/members-table"

const noop = fn()
const noopAsync = fn(async () => undefined)
const organization: OrganizationDetail = {
  id: "org-acme",
  name: "Acme Cloud",
  slug: "acme",
  profileImage: null,
  role: "super_admin",
  active: true,
  createdAt: "2026-07-14T00:00:00.000Z",
  invitationCount: 1,
  memberCount: 2,
  memberProfileImages: [],
  permissions: {
    canEditOrganization: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageAdmins: true,
    canTransferSuperAdmin: true,
  },
}
const owner: OrganizationMember = {
  id: "member-owner",
  userId: "user-owner",
  name: "Avery Stone",
  email: "avery@example.test",
  profileImage: null,
  role: "super_admin",
  createdAt: "2026-07-01T00:00:00.000Z",
}
const admin: OrganizationMember = {
  id: "member-admin",
  userId: "user-admin",
  name: "Jordan Lee",
  email: "jordan@example.test",
  profileImage: null,
  role: "admin",
  createdAt: "2026-07-02T00:00:00.000Z",
}
const members: OrganizationMember[] = [owner, admin]
const invitations: OrganizationInvitation[] = [
  {
    id: "invitation-1",
    email: "pending@example.test",
    role: "member",
    status: "pending",
    organizationId: organization.id,
    inviterId: owner.userId,
    inviter: {
      id: owner.userId,
      name: owner.name,
      email: owner.email,
      profileImage: null,
    },
    expiresAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-07-24T00:00:00.000Z",
  },
]
const stepUpRequest = {
  action: "organization.member.remove",
  maxAgeSeconds: 600,
} as const

const MemberStoryFrame = ({ children }: { children: React.ReactNode }) => (
  <Providers>
    <div className="mx-auto w-full max-w-6xl">{children}</div>
  </Providers>
)

const meta = {
  title: "Web/Members/Component Catalogue",
  component: MemberStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MemberStoryFrame>

export default meta
type Story = StoryObj<typeof meta>

export const FullMembersPage: Story = {
  args: { children: null },
  render: () => (
    <MemberStoryFrame>
      <MembersPage
        organization={organization}
        initialMembers={members}
        initialInvitations={invitations}
      />
    </MemberStoryFrame>
  ),
}

export const MembersManagementPanel: Story = {
  args: { children: null },
  render: () => (
    <MemberStoryFrame>
      <MembersPanel
        organization={organization}
        members={members}
        invitations={invitations}
      />
    </MemberStoryFrame>
  ),
}

export const MemberTable: Story = {
  args: { children: null },
  render: () => (
    <MemberStoryFrame>
      <MembersTable
        organizationName={organization.name}
        organizationRole={organization.role}
        members={members}
        pending={false}
        canManageMembers
        canManageRoles
        canTransferSuperAdmin
        onChangeRole={noop}
        onRequestRemove={noop}
      />
    </MemberStoryFrame>
  ),
}

export const PendingInvitations: Story = {
  args: { children: null },
  render: () => (
    <MemberStoryFrame>
      <InvitationsSection
        organizationName={organization.name}
        invitations={invitations}
        pending={false}
        canCancel
        canResend
        canResendAdmins
        mutationPending={false}
        onCancel={noop}
        onResend={noop}
        onRetry={noop}
      />
    </MemberStoryFrame>
  ),
}

export const InviteMembers: Story = {
  args: { children: null },
  render: () => (
    <MemberStoryFrame>
      <InviteMemberDialog
        canInviteAdmins
        pending={false}
        onInvite={noopAsync}
      />
    </MemberStoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole("button", { name: "Invite members" })
    )
    await waitFor(() =>
      expect(
        within(document.body).getByRole("dialog", { name: "Invite members" })
      ).toBeVisible()
    )
  },
}

export const ConfirmMemberRemoval: Story = {
  args: { children: null },
  render: () => (
    <MemberStoryFrame>
      <MemberConfirmationDialog
        action="remove"
        member={admin}
        pending={false}
        onClose={noop}
        onConfirm={noopAsync}
      />
    </MemberStoryFrame>
  ),
}

export const RecentSignInRequired: Story = {
  args: { children: null },
  render: () => (
    <MemberStoryFrame>
      <StepUpDialog request={stepUpRequest} onClose={noop} />
    </MemberStoryFrame>
  ),
}

export const SignedOutInvitation: Story = {
  args: { children: null },
  render: () => (
    <MemberStoryFrame>
      <InvitationDecisionPanel invitationId="invitation-1" state="signed_out" />
    </MemberStoryFrame>
  ),
}
