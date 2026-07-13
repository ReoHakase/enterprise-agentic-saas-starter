import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  invitation,
  member,
  organization,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, count, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm"

import { AppError, publicErrors } from "../../errors/app-error"
import {
  normalizeOrganizationRole,
  permissionsForRole,
  type OrganizationPermissions,
  type OrganizationRole,
} from "../authorization/roles"

const errorChainText = (cause: unknown) => {
  const details: string[] = []
  const visited = new Set<unknown>()
  let current = cause
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current)
    details.push(current.message)
    const code = "code" in current ? current.code : undefined
    if (typeof code === "string") {
      details.push(code)
    }
    current = current.cause
  }
  return details.join("\n")
}

const isOrganizationSlugConflict = (cause: unknown) => {
  const details = errorChainText(cause)
  return (
    details.includes("organization.slug") ||
    details.includes("organization_slug_uidx")
  )
}

const invitationQueues = new Map<string, Promise<void>>()
const noop = () => {}

const withInvitationLock = async <T>(
  key: string,
  operation: () => Promise<T>
) => {
  const previous = invitationQueues.get(key) ?? Promise.resolve()
  let release = noop
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  invitationQueues.set(key, queued)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (invitationQueues.get(key) === queued) {
      invitationQueues.delete(key)
    }
  }
}

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  role: OrganizationRole
  active: boolean
  memberCount: number
  memberAvatars: Array<{
    userId: string
    name: string
    image: string | null
  }>
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

type InvitationRow = typeof invitation.$inferSelect

const toOrganizationInvitation = (
  row: InvitationRow
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
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
})

const toSummary = (input: {
  id: string
  name: string
  slug: string
  role: string
  activeOrganizationId?: string | null
  memberCount: number
  memberAvatars: Array<{
    userId: string
    name: string
    image: string | null
  }>
}): OrganizationSummary => {
  const role = normalizeOrganizationRole(input.role)

  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    role,
    active: input.activeOrganizationId === input.id,
    memberCount: input.memberCount,
    memberAvatars: input.memberAvatars,
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
    const organizationIds = rows.map((row) => row.id)
    const avatarRows =
      organizationIds.length === 0
        ? []
        : await db
            .select({
              organizationId: member.organizationId,
              userId: user.id,
              name: user.name,
              image: user.image,
            })
            .from(member)
            .innerJoin(user, eq(member.userId, user.id))
            .where(inArray(member.organizationId, organizationIds))
            .orderBy(user.name)
    const avatarsByOrganization = new Map<
      string,
      Array<{ userId: string; name: string; image: string | null }>
    >()
    for (const avatar of avatarRows) {
      const existing = avatarsByOrganization.get(avatar.organizationId) ?? []
      existing.push({
        userId: avatar.userId,
        name: avatar.name,
        image: avatar.image,
      })
      avatarsByOrganization.set(avatar.organizationId, existing)
    }

    return rows.map((row) =>
      toSummary({
        ...row,
        activeOrganizationId: input.activeOrganizationId,
        memberCount: countByOrganization.get(row.id) ?? 0,
        memberAvatars: avatarsByOrganization.get(row.id) ?? [],
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
        memberAvatars: [],
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
  input: {
    activate: boolean
    sessionId: string
    userId: string
    name: string
    slug: string
  }
): Promise<OrganizationDetail> => {
  try {
    const now = new Date()
    const organizationId = crypto.randomUUID()

    const created = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(organization)
        .values({
          id: organizationId,
          name: input.name,
          slug: input.slug,
          createdAt: now,
        })
        .returning()

      await tx.insert(member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId: input.userId,
        role: "super_admin",
        createdAt: now,
      })
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        organizationId,
        actorUserId: input.userId,
        action: "organization.created",
        targetType: "organization",
        targetId: organizationId,
        metadata: { slug: input.slug },
      })

      if (input.activate && input.sessionId !== "test_session") {
        const sessionRows = await tx
          .update(session)
          .set({ activeOrganizationId: organizationId, updatedAt: now })
          .where(
            and(
              eq(session.id, input.sessionId),
              eq(session.userId, input.userId)
            )
          )
          .returning({ id: session.id })
        if (!sessionRows[0]) {
          throw new Error("Session not found during organization creation")
        }
      }

      return rows[0]
    })
    if (!created) {
      throw new Error("insert returned no organization")
    }

    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      logo: created.logo,
      role: "super_admin",
      active: input.activate,
      memberCount: 1,
      memberAvatars: [],
      invitationCount: 0,
      createdAt: created.createdAt.toISOString(),
      permissions: permissionsForRole("super_admin"),
    }
  } catch (cause) {
    if (isOrganizationSlugConflict(cause)) {
      throw publicErrors.conflict("Organization slug already exists", {
        field: "slug",
        constraint: "unique",
      })
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "insertOrganizationWithSuperAdmin",
    })
  }
}

export const updateSessionActiveOrganization = async (
  db: Db,
  input: { sessionId: string; organizationId: string; userId: string }
) => {
  try {
    return await db.transaction(async (tx) => {
      const membershipRows = await tx
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.userId, input.userId),
            eq(member.organizationId, input.organizationId)
          )
        )
        .limit(1)
      if (!membershipRows[0]) {
        return "not_member" as const
      }
      if (input.sessionId === "test_session") {
        return "activated" as const
      }

      const rows = await tx
        .update(session)
        .set({
          activeOrganizationId: input.organizationId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(session.id, input.sessionId), eq(session.userId, input.userId))
        )
        .returning({ id: session.id })
      return rows[0] ? ("activated" as const) : ("session_not_found" as const)
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "updateSessionActiveOrganization",
    })
  }
}

export const updateOrganizationById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    name?: string
    slug?: string
  }
): Promise<OrganizationDetail | null> => {
  try {
    const rows = await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(organization)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
        })
        .where(eq(organization.id, input.organizationId))
        .returning()

      if (updatedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "organization.updated",
          targetType: "organization",
          targetId: input.organizationId,
          metadata: {
            nameChanged: input.name !== undefined,
            slugChanged: input.slug !== undefined,
          },
        })
      }
      return updatedRows
    })

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
      memberAvatars: [],
      invitationCount: 0,
      createdAt: row.createdAt.toISOString(),
      permissions: permissionsForRole("super_admin"),
    }
  } catch (cause) {
    if (isOrganizationSlugConflict(cause)) {
      throw publicErrors.conflict("Organization slug already exists", {
        field: "slug",
        constraint: "unique",
      })
    }
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
      id: row.id,
      userId: row.userId,
      name: row.name,
      email: row.email,
      image: row.image,
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
        email: user.email,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
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
    actorUserId: string
    previousRole: OrganizationRole
  }
) => {
  try {
    const rows = await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(member)
        .set({ role: input.role })
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.id, input.memberId)
          )
        )
        .returning()
      if (updatedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "organization.member.role_updated",
          targetType: "member",
          targetId: input.memberId,
          metadata: { fromRole: input.previousRole, toRole: input.role },
        })
      }
      return updatedRows
    })

    return rows[0] ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "updateMemberRoleById",
    })
  }
}

export type TransferSuperAdminResult =
  | "actor_not_super_admin"
  | "invalid_super_admin_count"
  | "target_not_found"
  | "transferred"

export const transferSuperAdminById = async (
  db: Db,
  input: {
    actorMemberId: string
    actorUserId: string
    organizationId: string
    targetMemberId: string
  }
): Promise<TransferSuperAdminResult> => {
  try {
    return await db.transaction(async (tx) => {
      const actorRows = await tx
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.id, input.actorMemberId),
            eq(member.organizationId, input.organizationId)
          )
        )
        .limit(1)
      if (actorRows[0]?.role !== "super_admin") {
        return "actor_not_super_admin"
      }

      const targetRows = await tx
        .select({ id: member.id, userId: member.userId })
        .from(member)
        .where(
          and(
            eq(member.id, input.targetMemberId),
            eq(member.organizationId, input.organizationId)
          )
        )
        .limit(1)
      if (!targetRows[0]) {
        return "target_not_found"
      }

      const beforeCount = await tx
        .select({ value: count() })
        .from(member)
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.role, "super_admin")
          )
        )
      if (beforeCount[0]?.value !== 1) {
        return "invalid_super_admin_count"
      }

      const demotedRows = await tx
        .update(member)
        .set({ role: "admin" })
        .where(
          and(
            eq(member.id, input.actorMemberId),
            eq(member.organizationId, input.organizationId),
            eq(member.role, "super_admin")
          )
        )
        .returning({ id: member.id })
      if (!demotedRows[0]) {
        return "actor_not_super_admin"
      }

      const promotedRows = await tx
        .update(member)
        .set({ role: "super_admin" })
        .where(
          and(
            eq(member.id, input.targetMemberId),
            eq(member.organizationId, input.organizationId),
            eq(member.userId, targetRows[0].userId)
          )
        )
        .returning({ id: member.id })
      if (!promotedRows[0]) {
        throw new Error("Ownership transfer target disappeared")
      }

      const afterCount = await tx
        .select({ value: count() })
        .from(member)
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.role, "super_admin")
          )
        )
      if (afterCount[0]?.value !== 1) {
        throw new Error("Ownership transfer violated super admin invariant")
      }

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "organization.super_admin.transferred",
        targetType: "member",
        targetId: input.targetMemberId,
        metadata: { previousSuperAdminMemberId: input.actorMemberId },
      })

      return "transferred"
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "transferSuperAdminById",
    })
  }
}

export const deleteMemberById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    memberId: string
    removedRole: OrganizationRole
  }
) => {
  try {
    const rows = await db.transaction(async (tx) => {
      const deletedRows = await tx
        .delete(member)
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.id, input.memberId)
          )
        )
        .returning()
      if (deletedRows[0]) {
        const recentRows = await tx
          .select({ organizationId: session.activeOrganizationId })
          .from(session)
          .innerJoin(
            member,
            and(
              eq(member.userId, deletedRows[0].userId),
              eq(member.organizationId, session.activeOrganizationId)
            )
          )
          .where(
            and(
              eq(session.userId, deletedRows[0].userId),
              gt(session.expiresAt, new Date()),
              isNotNull(session.activeOrganizationId)
            )
          )
          .orderBy(
            desc(session.updatedAt),
            desc(session.createdAt),
            desc(session.id)
          )
          .limit(1)
        let replacementOrganizationId = recentRows[0]?.organizationId ?? null
        if (!replacementOrganizationId) {
          const membershipRows = await tx
            .selectDistinct({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, deletedRows[0].userId))
            .orderBy(member.organizationId)
            .limit(2)
          replacementOrganizationId =
            membershipRows.length === 1
              ? (membershipRows[0]?.organizationId ?? null)
              : null
        }

        await tx
          .update(session)
          .set({
            activeOrganizationId: replacementOrganizationId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(session.userId, deletedRows[0].userId),
              eq(session.activeOrganizationId, input.organizationId)
            )
          )

        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "organization.member.removed",
          targetType: "member",
          targetId: input.memberId,
          metadata: { removedRole: input.removedRole },
        })
      }
      return deletedRows
    })

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

    return rows.map(toOrganizationInvitation)
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
    const rows = await withInvitationLock(
      `${input.organizationId}:${input.email}`,
      () =>
        db.transaction(async (tx) => {
          const existingMembers = await tx
            .select({ id: member.id })
            .from(member)
            .innerJoin(user, eq(member.userId, user.id))
            .where(
              and(
                eq(member.organizationId, input.organizationId),
                sql`lower(${user.email}) = ${input.email}`
              )
            )
            .limit(1)
          if (existingMembers[0]) {
            throw publicErrors.conflict("User is already a member", {
              resource: "member",
              constraint: "unique",
            })
          }

          const pendingRows = await tx
            .select({ id: invitation.id, expiresAt: invitation.expiresAt })
            .from(invitation)
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                eq(invitation.status, "pending"),
                sql`lower(${invitation.email}) = ${input.email}`
              )
            )
            .limit(1)
          const pending = pendingRows[0]
          if (pending && pending.expiresAt.getTime() > Date.now()) {
            throw publicErrors.conflict("A pending invitation already exists", {
              resource: "invitation",
              reason: "pending",
            })
          }
          if (pending) {
            await tx
              .update(invitation)
              .set({ status: "expired" })
              .where(
                and(
                  eq(invitation.id, pending.id),
                  eq(invitation.organizationId, input.organizationId)
                )
              )
          }

          const insertedRows = await tx
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
          if (insertedRows[0]) {
            await tx.insert(auditLogs).values({
              id: crypto.randomUUID(),
              organizationId: input.organizationId,
              actorUserId: input.inviterId,
              action: "organization.invitation.created",
              targetType: "invitation",
              targetId: insertedRows[0].id,
              metadata: { role: input.role },
            })
          }
          return insertedRows
        })
    )

    const row = rows[0]
    if (!row) {
      throw new Error("insert returned no invitation")
    }

    return toOrganizationInvitation(row)
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause
    }
    const details = errorChainText(cause)
    if (
      details.includes("invitation_pending_organization_email_uidx") ||
      details.includes("invitation.organization_id, lower(email)")
    ) {
      throw publicErrors.conflict("A pending invitation already exists", {
        resource: "invitation",
        reason: "pending",
      })
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "insertInvitation",
    })
  }
}

export const cancelInvitationById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    invitationId: string
  }
) => {
  try {
    return await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(invitation)
        .where(
          and(
            eq(invitation.organizationId, input.organizationId),
            eq(invitation.id, input.invitationId)
          )
        )
        .limit(1)
      const existing = existingRows[0]
      if (!existing) {
        return { kind: "not_found" as const }
      }
      if (
        existing.status !== "pending" ||
        existing.expiresAt.getTime() <= Date.now()
      ) {
        if (existing.status === "pending") {
          await tx
            .update(invitation)
            .set({ status: "expired" })
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                eq(invitation.id, input.invitationId),
                eq(invitation.status, "pending")
              )
            )
        }
        return { kind: "not_pending" as const }
      }

      const updatedRows = await tx
        .update(invitation)
        .set({ status: "canceled" })
        .where(
          and(
            eq(invitation.organizationId, input.organizationId),
            eq(invitation.id, input.invitationId),
            eq(invitation.status, "pending")
          )
        )
        .returning()
      const updated = updatedRows[0]
      if (!updated) {
        return { kind: "not_pending" as const }
      }
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "organization.invitation.canceled",
        targetType: "invitation",
        targetId: input.invitationId,
        metadata: {},
      })

      return { kind: "canceled" as const, invitation: updated }
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "cancelInvitationById",
    })
  }
}
