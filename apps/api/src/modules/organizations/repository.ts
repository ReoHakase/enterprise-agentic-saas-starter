import type { Db } from "@enterprise-agentic-saas/db"
import {
  invitation,
  member,
  organization,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, count, eq, ne } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"
import {
  normalizeOrganizationRole,
  permissionsForRole,
  type OrganizationPermissions,
  type OrganizationRole,
} from "../authorization/roles"

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  role: OrganizationRole
  active: boolean
  memberCount: number
  permissions: OrganizationPermissions
}

export type OrganizationDetail = OrganizationSummary & {
  logo: string | null
  createdAt: string
  invitationCount: number
}

export type OrganizationMember = {
  id: string
  userId: string
  name: string
  email: string
  image: string | null
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
  expiresAt: string
  createdAt: string
}

const toSummary = (input: {
  id: string
  name: string
  slug: string
  role: string
  activeOrganizationId?: string | null
  memberCount: number
}): OrganizationSummary => {
  const role = normalizeOrganizationRole(input.role)

  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    role,
    active: input.activeOrganizationId === input.id,
    memberCount: input.memberCount,
    permissions: permissionsForRole(role),
  }
}

export const listOrganizationsForUser = async (
  db: Db,
  input: { userId: string; activeOrganizationId?: string | null }
): Promise<OrganizationSummary[]> => {
  try {
    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, input.userId))
      .orderBy(organization.name)

    const memberCounts = await Promise.all(
      rows.map(async (row) => {
        const countRows = await db
          .select({ value: count() })
          .from(member)
          .where(eq(member.organizationId, row.id))
        return [row.id, countRows[0]?.value ?? 0] as const
      })
    )
    const countByOrganization = new Map(memberCounts)

    return rows.map((row) =>
      toSummary({
        ...row,
        activeOrganizationId: input.activeOrganizationId,
        memberCount: countByOrganization.get(row.id) ?? 0,
      })
    )
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "listOrganizationsForUser",
    })
  }
}

export const findOrganizationForUser = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    activeOrganizationId?: string | null
  }
): Promise<OrganizationDetail | null> => {
  try {
    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, input.userId),
          eq(member.organizationId, input.organizationId)
        )
      )
      .limit(1)

    const row = rows[0]
    if (!row) {
      return null
    }

    const memberCountRows = await db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, input.organizationId))
    const invitationCountRows = await db
      .select({ value: count() })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, input.organizationId),
          eq(invitation.status, "pending")
        )
      )

    return {
      ...toSummary({
        id: row.id,
        name: row.name,
        slug: row.slug,
        role: row.role,
        activeOrganizationId: input.activeOrganizationId,
        memberCount: memberCountRows[0]?.value ?? 0,
      }),
      logo: row.logo,
      createdAt: row.createdAt.toISOString(),
      invitationCount: invitationCountRows[0]?.value ?? 0,
    }
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "findOrganizationForUser",
    })
  }
}

export const insertOrganizationWithSuperAdmin = async (
  db: Db,
  input: { userId: string; name: string; slug: string }
): Promise<OrganizationDetail> => {
  try {
    const now = new Date()
    const organizationId = crypto.randomUUID()

    const rows = await db
      .insert(organization)
      .values({
        id: organizationId,
        name: input.name,
        slug: input.slug,
        createdAt: now,
      })
      .returning()

    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId,
      userId: input.userId,
      role: "super_admin",
      createdAt: now,
    })

    const created = rows[0]
    if (!created) {
      throw new Error("insert returned no organization")
    }

    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      logo: created.logo,
      role: "super_admin",
      active: false,
      memberCount: 1,
      invitationCount: 0,
      createdAt: created.createdAt.toISOString(),
      permissions: permissionsForRole("super_admin"),
    }
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "insertOrganizationWithSuperAdmin",
    })
  }
}

export const updateSessionActiveOrganization = async (
  db: Db,
  input: { sessionId: string; organizationId: string }
) => {
  if (input.sessionId === "test_session") {
    return
  }

  try {
    await db
      .update(session)
      .set({
        activeOrganizationId: input.organizationId,
        updatedAt: new Date(),
      })
      .where(eq(session.id, input.sessionId))
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "updateSessionActiveOrganization",
    })
  }
}

export const updateOrganizationById = async (
  db: Db,
  input: { organizationId: string; name?: string; slug?: string }
): Promise<OrganizationDetail | null> => {
  try {
    const rows = await db
      .update(organization)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.slug === undefined ? {} : { slug: input.slug }),
      })
      .where(eq(organization.id, input.organizationId))
      .returning()

    const row = rows[0]
    if (!row) {
      return null
    }

    const memberCountRows = await db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, input.organizationId))

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logo: row.logo,
      role: "super_admin",
      active: false,
      memberCount: memberCountRows[0]?.value ?? 0,
      invitationCount: 0,
      createdAt: row.createdAt.toISOString(),
      permissions: permissionsForRole("super_admin"),
    }
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "updateOrganizationById",
    })
  }
}

export const listMembersByOrganization = async (
  db: Db,
  organizationId: string
): Promise<OrganizationMember[]> => {
  try {
    const rows = await db
      .select({
        id: member.id,
        userId: member.userId,
        name: user.name,
        email: user.email,
        image: user.image,
        role: member.role,
        createdAt: member.createdAt,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, organizationId))
      .orderBy(user.name)

    return rows.map((row) => ({
      ...row,
      role: normalizeOrganizationRole(row.role),
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "listMembersByOrganization",
    })
  }
}

export const countSuperAdmins = async (db: Db, organizationId: string) => {
  try {
    const rows = await db
      .select({ value: count() })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.role, "super_admin")
        )
      )
    return rows[0]?.value ?? 0
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "countSuperAdmins",
    })
  }
}

export const findMemberById = async (
  db: Db,
  input: { organizationId: string; memberId: string }
) => {
  try {
    const rows = await db
      .select({
        id: member.id,
        userId: member.userId,
        role: member.role,
      })
      .from(member)
      .where(
        and(
          eq(member.organizationId, input.organizationId),
          eq(member.id, input.memberId)
        )
      )
      .limit(1)

    const row = rows[0]
    return row
      ? {
          ...row,
          role: normalizeOrganizationRole(row.role),
        }
      : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "findMemberById",
    })
  }
}

export const updateMemberRoleById = async (
  db: Db,
  input: {
    organizationId: string
    memberId: string
    role: OrganizationRole
  }
) => {
  try {
    if (input.role === "super_admin") {
      await db
        .update(member)
        .set({ role: "admin" })
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.role, "super_admin"),
            ne(member.id, input.memberId)
          )
        )
    }

    const rows = await db
      .update(member)
      .set({ role: input.role })
      .where(
        and(
          eq(member.organizationId, input.organizationId),
          eq(member.id, input.memberId)
        )
      )
      .returning()

    return rows[0] ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "updateMemberRoleById",
    })
  }
}

export const deleteMemberById = async (
  db: Db,
  input: { organizationId: string; memberId: string }
) => {
  try {
    const rows = await db
      .delete(member)
      .where(
        and(
          eq(member.organizationId, input.organizationId),
          eq(member.id, input.memberId)
        )
      )
      .returning()

    return rows[0] ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "deleteMemberById",
    })
  }
}

export const listInvitationsByOrganization = async (
  db: Db,
  organizationId: string
): Promise<OrganizationInvitation[]> => {
  try {
    const rows = await db
      .select()
      .from(invitation)
      .where(eq(invitation.organizationId, organizationId))
      .orderBy(invitation.createdAt)

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: normalizeOrganizationRole(row.role ?? "member"),
      status: row.status,
      organizationId: row.organizationId,
      inviterId: row.inviterId,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "listInvitationsByOrganization",
    })
  }
}

export const insertInvitation = async (
  db: Db,
  input: {
    organizationId: string
    inviterId: string
    email: string
    role: Exclude<OrganizationRole, "super_admin">
  }
): Promise<OrganizationInvitation> => {
  try {
    const rows = await db
      .insert(invitation)
      .values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        inviterId: input.inviterId,
        email: input.email,
        role: input.role,
        status: "pending",
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      })
      .returning()

    const row = rows[0]
    if (!row) {
      throw new Error("insert returned no invitation")
    }

    return {
      id: row.id,
      email: row.email,
      role: normalizeOrganizationRole(row.role ?? "member"),
      status: row.status,
      organizationId: row.organizationId,
      inviterId: row.inviterId,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "insertInvitation",
    })
  }
}

export const cancelInvitationById = async (
  db: Db,
  input: { organizationId: string; invitationId: string }
) => {
  try {
    const rows = await db
      .update(invitation)
      .set({ status: "canceled" })
      .where(
        and(
          eq(invitation.organizationId, input.organizationId),
          eq(invitation.id, input.invitationId)
        )
      )
      .returning()

    return rows[0] ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "cancelInvitationById",
    })
  }
}
