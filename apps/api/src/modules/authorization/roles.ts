import type { Db } from "@enterprise-agentic-saas/db"
import { member } from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"

export const organizationRoles = ["super_admin", "admin", "member"] as const

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

export const getMembership = async (
  db: Db,
  input: { userId: string; organizationId: string }
) => {
  try {
    const rows = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, input.userId),
          eq(member.organizationId, input.organizationId)
        )
      )
      .limit(1)

    const row = rows[0]
    return row
      ? { id: row.id, role: normalizeOrganizationRole(row.role) }
      : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "authorization",
      operation: "getMembership",
    })
  }
}

export const requireMembership = async (
  db: Db,
  input: { userId: string; organizationId: string }
) => {
  const membership = await getMembership(db, input)

  if (!membership) {
    // organizationの存在と「他tenantに存在する」ことを区別させない。
    throw publicErrors.notFound("Organization not found", {
      resource: "organization",
    })
  }

  return membership
}

export const requireOrganizationRole = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    allow: readonly OrganizationRole[]
    action: string
  }
) => {
  const membership = await requireMembership(db, input)

  if (!input.allow.includes(membership.role)) {
    throw publicErrors.forbidden("You are not allowed to perform this action", {
      action: input.action,
    })
  }

  return membership
}
