const organizationRoles = ["owner", "admin", "member"] as const

export type OrganizationRole = (typeof organizationRoles)[number]

export type OrganizationPermissions = {
  canEditOrganization: boolean
  canInviteMembers: boolean
  canManageMembers: boolean
  canManageAdmins: boolean
  canTransferOwnership: boolean
}

export const isOrganizationRole = (value: string): value is OrganizationRole =>
  value === "owner" || value === "admin" || value === "member"

export const normalizeOrganizationRole = (role: string): OrganizationRole => {
  if (isOrganizationRole(role)) {
    return role
  }

  throw new Error("Invalid organization role")
}

export const permissionsForRole = (role: string): OrganizationPermissions => {
  const normalized = normalizeOrganizationRole(role)

  return {
    canEditOrganization: normalized === "owner",
    canInviteMembers: normalized === "owner" || normalized === "admin",
    canManageMembers: normalized === "owner" || normalized === "admin",
    canManageAdmins: normalized === "owner",
    canTransferOwnership: normalized === "owner",
  }
}
