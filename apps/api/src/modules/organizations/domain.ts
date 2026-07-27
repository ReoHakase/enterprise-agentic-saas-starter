import {
  normalizeOrganizationRole,
  permissionsForRole,
  type OrganizationPermissions,
  type OrganizationRole,
} from "../authorization/public"

/*
 * DTO mapping stays independent from persistence queries so repository slices
 * share one tenant-safe projection.
 */

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  profileImage: string | null
  role: OrganizationRole
  active: boolean
  memberCount: number
  memberProfileImages: Array<{
    userId: string
    name: string
    profileImage: string | null
  }>
  permissions: OrganizationPermissions
}

export type OrganizationDetail = OrganizationSummary & {
  createdAt: string
  invitationCount: number
}

export type OrganizationMember = {
  id: string
  userId: string
  name: string
  email: string
  profileImage: string | null
  githubLinked: boolean
  passkeyLinked: boolean
  role: OrganizationRole
  createdAt: string
}

export type OrganizationInvitation = {
  id: string
  email: string
  role: OrganizationRole
  status: string
  organizationId: string
  inviterId: string
  inviter: {
    id: string
    name: string
    email: string
    profileImage: string | null
  }
  expiresAt: string
  createdAt: string
}

export type OrganizationDeletionReceipt = {
  deletionId: string
  organizationId: string
  status: "deleted"
}

export type InvitationRecord = {
  createdAt: Date
  email: string
  expiresAt: Date
  id: string
  inviterId: string
  organizationId: string
  role: string | null
  status: string
}

export const toOrganizationInvitation = (
  row: InvitationRecord,
  inviter: {
    id: string
    name: string
    email: string
    profileImage: string | null
  }
): OrganizationInvitation => ({
  id: row.id,
  email: row.email,
  role: normalizeOrganizationRole(row.role ?? "member"),
  status:
    row.status === "pending" && row.expiresAt.getTime() <= Date.now()
      ? "expired"
      : row.status,
  organizationId: row.organizationId,
  inviterId: row.inviterId,
  inviter,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
})

export const toSummary = (input: {
  id: string
  name: string
  slug: string
  profileImage: string | null
  role: string
  activeOrganizationId?: string | null
  memberCount: number
  memberProfileImages: Array<{
    userId: string
    name: string
    profileImage: string | null
  }>
}): OrganizationSummary => {
  const role = normalizeOrganizationRole(input.role)

  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    profileImage: input.profileImage,
    role,
    active: input.activeOrganizationId === input.id,
    memberCount: input.memberCount,
    memberProfileImages: input.memberProfileImages,
    permissions: permissionsForRole(role),
  }
}

export const toOrganizationDeletionReceipt = (input: {
  id: string
  organizationId: string
}): OrganizationDeletionReceipt => ({
  deletionId: input.id,
  organizationId: input.organizationId,
  status: "deleted",
})
