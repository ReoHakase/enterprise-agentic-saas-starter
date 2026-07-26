import type { OrganizationDetail } from "@/features/organizations"

import type { OrganizationInvitation, OrganizationMember } from "../schema"

export const fictionalMemberOrganization = {
  id: "org_01K1ACMECLOUD0000000000",
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
} satisfies OrganizationDetail

const fictionalOwner = {
  id: "member_01K1OWNER000000000000",
  userId: "user_01K1AVERY00000000000000",
  name: "Avery Stone",
  email: "avery@example.test",
  profileImage: null,
  role: "super_admin",
  createdAt: "2026-07-01T00:00:00.000Z",
} satisfies OrganizationMember

export const fictionalMembers = [
  fictionalOwner,
  {
    id: "member_01K1ADMIN000000000000",
    userId: "user_01K1JORDAN0000000000000",
    name: "Jordan Lee",
    email: "jordan@example.test",
    profileImage: null,
    role: "admin",
    createdAt: "2026-07-02T00:00:00.000Z",
  },
] satisfies OrganizationMember[]

export const fictionalInvitations = [
  {
    id: "invitation_01K1PENDING00000000",
    email: "pending@example.test",
    role: "member",
    status: "pending",
    organizationId: fictionalMemberOrganization.id,
    inviterId: fictionalOwner.userId,
    inviter: {
      id: fictionalOwner.userId,
      name: fictionalOwner.name,
      email: fictionalOwner.email,
      profileImage: null,
    },
    expiresAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-07-24T00:00:00.000Z",
  },
] satisfies OrganizationInvitation[]
