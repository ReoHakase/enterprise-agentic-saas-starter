import type { OrganizationDetail, OrganizationSummary } from "../schema"

const fictionalOrganizationPermissions = {
  canEditOrganization: true,
  canInviteMembers: true,
  canManageMembers: true,
  canManageAdmins: true,
  canTransferOwnership: true,
} as const

const fictionalOrganizationSummary = {
  id: "org_01K1ACMECLOUD0000000000",
  name: "Acme Cloud",
  slug: "acme",
  role: "owner",
  active: true,
  profileImage: null,
  memberCount: 4,
  memberProfileImages: [],
  permissions: fictionalOrganizationPermissions,
} satisfies OrganizationSummary

export const fictionalOrganizations = [
  fictionalOrganizationSummary,
  {
    id: "org_01K1BETALABS00000000000",
    name: "Beta Labs",
    slug: "beta",
    role: "admin",
    active: false,
    profileImage: null,
    memberCount: 3,
    memberProfileImages: [],
    permissions: fictionalOrganizationPermissions,
  },
] satisfies OrganizationSummary[]

export const fictionalOrganization = {
  ...fictionalOrganizationSummary,
  createdAt: "2026-07-20T09:00:00.000Z",
  invitationCount: 1,
} satisfies OrganizationDetail

export const fictionalReadOnlyOrganization = {
  ...fictionalOrganization,
  role: "member",
  permissions: {
    canEditOrganization: false,
    canInviteMembers: false,
    canManageMembers: false,
    canManageAdmins: false,
    canTransferOwnership: false,
  },
} satisfies OrganizationDetail
