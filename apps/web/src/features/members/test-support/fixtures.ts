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
  invitationCount: 5,
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
  githubLinked: true,
  passkeyLinked: true,
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
    githubLinked: true,
    passkeyLinked: false,
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
  {
    id: "invitation_01K1ACCEPTED0000000",
    email: "accepted@example.test",
    role: "admin",
    status: "accepted",
    organizationId: fictionalMemberOrganization.id,
    inviterId: fictionalOwner.userId,
    inviter: {
      id: fictionalOwner.userId,
      name: fictionalOwner.name,
      email: fictionalOwner.email,
      profileImage: null,
    },
    expiresAt: "2026-07-31T00:00:00.000Z",
    createdAt: "2026-07-23T00:00:00.000Z",
  },
  {
    id: "invitation_01K1REJECTED0000000",
    email: "rejected@example.test",
    role: "member",
    status: "rejected",
    organizationId: fictionalMemberOrganization.id,
    inviterId: fictionalOwner.userId,
    inviter: {
      id: fictionalOwner.userId,
      name: fictionalOwner.name,
      email: fictionalOwner.email,
      profileImage: null,
    },
    expiresAt: "2026-07-30T00:00:00.000Z",
    createdAt: "2026-07-22T00:00:00.000Z",
  },
  {
    id: "invitation_01K1EXPIRED00000000",
    email: "expired@example.test",
    role: "member",
    status: "expired",
    organizationId: fictionalMemberOrganization.id,
    inviterId: fictionalOwner.userId,
    inviter: {
      id: fictionalOwner.userId,
      name: fictionalOwner.name,
      email: fictionalOwner.email,
      profileImage: null,
    },
    expiresAt: "2026-07-20T00:00:00.000Z",
    createdAt: "2026-07-21T00:00:00.000Z",
  },
  {
    id: "invitation_01K1CANCELED0000000",
    email: "canceled@example.test",
    role: "admin",
    status: "canceled",
    organizationId: fictionalMemberOrganization.id,
    inviterId: fictionalOwner.userId,
    inviter: {
      id: fictionalOwner.userId,
      name: fictionalOwner.name,
      email: fictionalOwner.email,
      profileImage: null,
    },
    expiresAt: "2026-07-29T00:00:00.000Z",
    createdAt: "2026-07-20T00:00:00.000Z",
  },
] satisfies OrganizationInvitation[]
