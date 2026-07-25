import { publicErrors } from "../../errors/app-error"

const organizationRoles = ["super_admin", "admin", "member"] as const

export type OrganizationRole = (typeof organizationRoles)[number]

export type OrganizationPermissions = {
  canEditOrganization: boolean
  canInviteMembers: boolean
  canManageMembers: boolean
  canManageAdmins: boolean
  canTransferSuperAdmin: boolean
}

export const isOrganizationRole = (value: string): value is OrganizationRole =>
  value === "super_admin" || value === "admin" || value === "member"

export const normalizeOrganizationRole = (role: string): OrganizationRole => {
  if (isOrganizationRole(role)) {
    return role
  }

  throw publicErrors.internal(new Error("Invalid organization role"), {
    module: "authorization",
    operation: "normalizeOrganizationRole",
    role,
  })
}

export const permissionsForRole = (role: string): OrganizationPermissions => {
  const normalized = normalizeOrganizationRole(role)

  return {
    canEditOrganization: normalized === "super_admin",
    canInviteMembers: normalized === "super_admin" || normalized === "admin",
    canManageMembers: normalized === "super_admin" || normalized === "admin",
    canManageAdmins: normalized === "super_admin",
    canTransferSuperAdmin: normalized === "super_admin",
  }
}
