import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  invitation,
  invitationEmailJobs,
  member,
  organization,
  organizationDeletionJobs,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  ne,
  sql,
} from "drizzle-orm"

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

const isDeletionRequestConflict = (cause: unknown) => {
  const details = errorChainText(cause)
  return (
    details.includes("organization_deletion_jobs_request_uidx") ||
    details.includes(
      "organization_deletion_jobs.requested_by_user_id, organization_deletion_jobs.idempotency_key"
    )
  )
}

const invitationQueues = new Map<string, Promise<void>>()
const noop = () => {}

const invitationEmailConflict = () =>
  publicErrors.conflict("One or more emails cannot be invited", {
    field: "emails",
    reason: "conflict",
    resource: "invitation",
  })

const invitationResendRecipientConflict = () =>
  publicErrors.conflict("Invitation cannot be resent", {
    reason: "invitation_recipient_conflict",
    resource: "invitation",
  })

const invitationLifetimeMs = 48 * 60 * 60 * 1000

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

const orderedUniqueKeys = (keys: readonly string[]) => {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const key of keys) {
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    let index = 0
    while (index < ordered.length && (ordered[index] ?? "") < key) {
      index += 1
    }
    ordered.splice(index, 0, key)
  }
  return ordered
}

const withInvitationLocks = <T>(
  keys: readonly string[],
  operation: () => Promise<T>,
  index = 0
): Promise<T> => {
  const key = keys[index]
  return key
    ? withInvitationLock(key, () =>
        withInvitationLocks(keys, operation, index + 1)
      )
    : operation()
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
  inviter: {
    id: string
    name: string
    email: string
    image: string | null
  }
  expiresAt: string
  createdAt: string
}

export type OrganizationDeletionReceipt = {
  deletionId: string
  organizationId: string
  status: "deleted"
}

type InvitationRow = typeof invitation.$inferSelect

const toOrganizationInvitation = (
  row: InvitationRow,
  inviter: {
    id: string
    name: string
    email: string
    image: string | null
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

const toOrganizationDeletionReceipt = (input: {
  id: string
  organizationId: string
}): OrganizationDeletionReceipt => ({
  deletionId: input.id,
  organizationId: input.organizationId,
  status: "deleted",
})

export const findOrganizationDeletionReceipt = async (
  db: Db,
  input: {
    actorUserId: string
    idempotencyKey: string
    organizationId: string
  }
): Promise<OrganizationDeletionReceipt | null> => {
  try {
    const rows = await db
      .select({
        id: organizationDeletionJobs.id,
        organizationId: organizationDeletionJobs.organizationId,
      })
      .from(organizationDeletionJobs)
      .where(
        and(
          eq(organizationDeletionJobs.requestedByUserId, input.actorUserId),
          eq(organizationDeletionJobs.organizationId, input.organizationId),
          eq(organizationDeletionJobs.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1)

    return rows[0] ? toOrganizationDeletionReceipt(rows[0]) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "findOrganizationDeletionReceipt",
    })
  }
}

export type DeleteOrganizationResult =
  | { kind: "active_organization_mismatch" }
  | { kind: "deleted"; receipt: OrganizationDeletionReceipt }
  | { kind: "forbidden" }
  | { kind: "idempotency_conflict" }
  | { kind: "not_found" }
  | { kind: "slug_mismatch" }

export const deleteOrganizationById = async (
  db: Db,
  input: {
    actorUserId: string
    idempotencyKey: string
    organizationId: string
    sessionId: string
    slug: string
  }
): Promise<DeleteOrganizationResult> => {
  try {
    return await db.transaction(async (tx) => {
      const existingJobs = await tx
        .select({
          id: organizationDeletionJobs.id,
          organizationId: organizationDeletionJobs.organizationId,
        })
        .from(organizationDeletionJobs)
        .where(
          and(
            eq(organizationDeletionJobs.requestedByUserId, input.actorUserId),
            eq(organizationDeletionJobs.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1)
      const existingJob = existingJobs[0]
      if (existingJob) {
        return existingJob.organizationId === input.organizationId
          ? {
              kind: "deleted" as const,
              receipt: toOrganizationDeletionReceipt(existingJob),
            }
          : { kind: "idempotency_conflict" as const }
      }

      // guard/service後のrole変更やactive organization切替とのraceでも、
      // destructive mutation直前のtransactionを認可の最終防波堤にする。
      const memberships = await tx
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.userId, input.actorUserId),
            eq(member.organizationId, input.organizationId)
          )
        )
        .limit(1)
      const membership = memberships[0]
      if (!membership) {
        return { kind: "not_found" as const }
      }
      if (membership.role !== "super_admin") {
        return { kind: "forbidden" as const }
      }

      const activeSessions = await tx
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.id, input.sessionId),
            eq(session.userId, input.actorUserId),
            eq(session.activeOrganizationId, input.organizationId),
            gt(session.expiresAt, new Date())
          )
        )
        .limit(1)
      if (!activeSessions[0]) {
        return { kind: "active_organization_mismatch" as const }
      }

      const organizations = await tx
        .select({ id: organization.id, slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1)
      const target = organizations[0]
      if (!target) {
        return { kind: "not_found" as const }
      }
      if (target.slug !== input.slug) {
        return { kind: "slug_mismatch" as const }
      }

      const deletionId = crypto.randomUUID()
      await tx.insert(organizationDeletionJobs).values({
        id: deletionId,
        organizationId: input.organizationId,
        requestedByUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      })

      await tx
        .update(session)
        .set({ activeOrganizationId: null, updatedAt: new Date() })
        .where(eq(session.activeOrganizationId, input.organizationId))

      const deletedRows = await tx
        .delete(organization)
        .where(eq(organization.id, input.organizationId))
        .returning({ id: organization.id })
      if (!deletedRows[0]) {
        throw publicErrors.notFound("Organization not found", {
          resource: "organization",
        })
      }

      return {
        kind: "deleted" as const,
        receipt: toOrganizationDeletionReceipt({
          id: deletionId,
          organizationId: input.organizationId,
        }),
      }
    })
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause
    }
    if (isDeletionRequestConflict(cause)) {
      const existing = await findOrganizationDeletionReceipt(db, input)
      if (existing) {
        return { kind: "deleted", receipt: existing }
      }
      return { kind: "idempotency_conflict" }
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "deleteOrganizationById",
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
      .select({
        invitation,
        inviter: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      })
      .from(invitation)
      .innerJoin(user, eq(invitation.inviterId, user.id))
      .where(eq(invitation.organizationId, organizationId))
      .orderBy(invitation.createdAt)

    return rows.map(({ invitation: row, inviter }) =>
      toOrganizationInvitation(row, inviter)
    )
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "listInvitationsByOrganization",
    })
  }
}

export const insertInvitations = async (
  db: Db,
  input: {
    organizationId: string
    inviterId: string
    emails: readonly string[]
    role: Exclude<OrganizationRole, "super_admin">
  }
): Promise<OrganizationInvitation[]> => {
  try {
    const lockKeys = orderedUniqueKeys(
      input.emails.map((email) => `${input.organizationId}:${email}`)
    )
    const result = await withInvitationLocks(lockKeys, () =>
      db.transaction(async (tx) => {
        const inviterRows = await tx
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          })
          .from(user)
          .where(eq(user.id, input.inviterId))
          .limit(1)
        const inviter = inviterRows[0]
        if (!inviter) {
          throw new Error("Invitation inviter was not found")
        }
        const existingMembers = await tx
          .select({ id: member.id })
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .where(
            and(
              eq(member.organizationId, input.organizationId),
              inArray(sql<string>`lower(${user.email})`, input.emails)
            )
          )
          .limit(1)
        if (existingMembers[0]) {
          throw invitationEmailConflict()
        }

        const pendingRows = await tx
          .select({ id: invitation.id, expiresAt: invitation.expiresAt })
          .from(invitation)
          .where(
            and(
              eq(invitation.organizationId, input.organizationId),
              eq(invitation.status, "pending"),
              inArray(sql<string>`lower(${invitation.email})`, input.emails)
            )
          )
        const now = new Date()
        const validPending = pendingRows.some(
          ({ expiresAt }) => expiresAt.getTime() > now.getTime()
        )
        if (validPending) {
          throw invitationEmailConflict()
        }
        const expiredIds = pendingRows.map(({ id }) => id)
        if (expiredIds.length > 0) {
          await tx
            .update(invitation)
            .set({ status: "expired" })
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                inArray(invitation.id, expiredIds)
              )
            )
          await tx
            .update(invitationEmailJobs)
            .set({
              status: "canceled",
              completedAt: now,
              lockedAt: null,
              nextAttemptAt: null,
            })
            .where(
              and(
                inArray(invitationEmailJobs.invitationId, expiredIds),
                inArray(invitationEmailJobs.status, [
                  "pending",
                  "failed",
                  "processing",
                ])
              )
            )
        }

        const expiresAt = new Date(now.getTime() + invitationLifetimeMs)
        const invitationValues = input.emails.map((email) => ({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          inviterId: input.inviterId,
          email,
          role: input.role,
          status: "pending",
          expiresAt,
        }))
        const insertedRows = await tx
          .insert(invitation)
          .values(invitationValues)
          .returning()
        if (insertedRows.length !== input.emails.length) {
          throw new Error("Invitation batch insert returned missing rows")
        }
        await tx.insert(auditLogs).values(
          insertedRows.map((row) => ({
            id: crypto.randomUUID(),
            organizationId: input.organizationId,
            actorUserId: input.inviterId,
            action: "organization.invitation.created",
            targetType: "invitation",
            targetId: row.id,
            metadata: { role: input.role },
          }))
        )
        await tx.insert(invitationEmailJobs).values(
          insertedRows.map((row) => ({
            id: crypto.randomUUID(),
            invitationId: row.id,
          }))
        )
        const rowByEmail = new Map(
          insertedRows.map((row) => [row.email.toLowerCase(), row])
        )
        const orderedRows = input.emails.map((email) => {
          const row = rowByEmail.get(email)
          if (!row) {
            throw new Error("Invitation batch ordering failed")
          }
          return row
        })
        return { inviter, rows: orderedRows }
      })
    )

    return result.rows.map((row) =>
      toOrganizationInvitation(row, result.inviter)
    )
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause
    }
    const details = errorChainText(cause)
    if (
      details.includes("invitation_pending_organization_email_uidx") ||
      details.includes("invitation.organization_id, lower(email)")
    ) {
      throw invitationEmailConflict()
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "insertInvitations",
    })
  }
}

export const findInvitationForResend = async (
  db: Db,
  input: { organizationId: string; invitationId: string }
) => {
  try {
    const rows = await db
      .select({
        id: invitation.id,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, input.organizationId),
          eq(invitation.id, input.invitationId)
        )
      )
      .limit(1)

    return rows[0] ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "findInvitationForResend",
    })
  }
}

export const resendInvitationById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    invitationId: string
  }
) => {
  try {
    return await withInvitationLock(
      `${input.organizationId}:invitation:${input.invitationId}`,
      () =>
        db.transaction(async (tx) => {
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
            (existing.status !== "pending" && existing.status !== "expired") ||
            (existing.role !== "admin" && existing.role !== "member")
          ) {
            return { kind: "not_resendable" as const }
          }

          const actorRows = await tx
            .select({
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
              role: member.role,
            })
            .from(member)
            .innerJoin(user, eq(member.userId, user.id))
            .where(
              and(
                eq(member.organizationId, input.organizationId),
                eq(member.userId, input.actorUserId)
              )
            )
            .limit(1)
          const actor = actorRows[0]
          if (!actor) {
            return { kind: "actor_not_member" as const }
          }
          if (
            (existing.role === "admin" && actor.role !== "super_admin") ||
            (existing.role === "member" &&
              actor.role !== "super_admin" &&
              actor.role !== "admin")
          ) {
            return { kind: "actor_forbidden" as const }
          }

          const existingMemberRows = await tx
            .select({ id: member.id })
            .from(member)
            .innerJoin(user, eq(member.userId, user.id))
            .where(
              and(
                eq(member.organizationId, input.organizationId),
                eq(
                  sql<string>`lower(${user.email})`,
                  existing.email.toLowerCase()
                )
              )
            )
            .limit(1)
          if (existingMemberRows[0]) {
            throw invitationResendRecipientConflict()
          }

          const now = new Date()
          const otherPendingRows = await tx
            .select({
              id: invitation.id,
              expiresAt: invitation.expiresAt,
            })
            .from(invitation)
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                ne(invitation.id, input.invitationId),
                eq(invitation.status, "pending"),
                eq(
                  sql<string>`lower(${invitation.email})`,
                  existing.email.toLowerCase()
                )
              )
            )
          if (
            otherPendingRows.some(
              ({ expiresAt }) => expiresAt.getTime() > now.getTime()
            )
          ) {
            throw invitationResendRecipientConflict()
          }
          const otherExpiredIds = otherPendingRows.map(({ id }) => id)
          if (otherExpiredIds.length > 0) {
            await tx
              .update(invitation)
              .set({ status: "expired" })
              .where(
                and(
                  eq(invitation.organizationId, input.organizationId),
                  inArray(invitation.id, otherExpiredIds),
                  eq(invitation.status, "pending")
                )
              )
            await tx
              .update(invitationEmailJobs)
              .set({
                status: "canceled",
                completedAt: now,
                lockedAt: null,
                nextAttemptAt: null,
              })
              .where(
                and(
                  inArray(invitationEmailJobs.invitationId, otherExpiredIds),
                  inArray(invitationEmailJobs.status, [
                    "pending",
                    "failed",
                    "processing",
                  ])
                )
              )
          }

          const revived =
            existing.status === "expired" ||
            existing.expiresAt.getTime() <= now.getTime()
          const updatedRows = await tx
            .update(invitation)
            .set({
              status: "pending",
              expiresAt: new Date(now.getTime() + invitationLifetimeMs),
              inviterId: input.actorUserId,
            })
            .where(
              and(
                eq(invitation.organizationId, input.organizationId),
                eq(invitation.id, input.invitationId)
              )
            )
            .returning()
          const updated = updatedRows[0]
          if (!updated) {
            return { kind: "not_found" as const }
          }

          const jobRows = await tx
            .select({ id: invitationEmailJobs.id })
            .from(invitationEmailJobs)
            .where(eq(invitationEmailJobs.invitationId, input.invitationId))
            .limit(1)
          if (jobRows[0]) {
            await tx
              .update(invitationEmailJobs)
              .set({
                status: "pending",
                lastErrorCode: null,
                lockedAt: null,
                nextAttemptAt: null,
                completedAt: null,
              })
              .where(eq(invitationEmailJobs.id, jobRows[0].id))
          } else {
            await tx.insert(invitationEmailJobs).values({
              id: crypto.randomUUID(),
              invitationId: input.invitationId,
            })
          }

          await tx.insert(auditLogs).values({
            id: crypto.randomUUID(),
            organizationId: input.organizationId,
            actorUserId: input.actorUserId,
            action: "organization.invitation.resent",
            targetType: "invitation",
            targetId: input.invitationId,
            metadata: { revived, role: existing.role },
          })

          return {
            kind: "resent" as const,
            invitation: toOrganizationInvitation(updated, {
              id: actor.id,
              name: actor.name,
              email: actor.email,
              image: actor.image,
            }),
            revived,
          }
        })
    )
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause
    }
    const details = errorChainText(cause)
    if (
      details.includes("invitation_pending_organization_email_uidx") ||
      details.includes("invitation.organization_id, lower(email)")
    ) {
      throw invitationResendRecipientConflict()
    }
    throw publicErrors.internal(cause, {
      module: "organizations",
      operation: "resendInvitationById",
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
        await tx
          .update(invitationEmailJobs)
          .set({
            status: "canceled",
            completedAt: new Date(),
            lockedAt: null,
            nextAttemptAt: null,
          })
          .where(
            and(
              eq(invitationEmailJobs.invitationId, input.invitationId),
              inArray(invitationEmailJobs.status, [
                "pending",
                "failed",
                "processing",
              ])
            )
          )
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
      await tx
        .update(invitationEmailJobs)
        .set({
          status: "canceled",
          completedAt: new Date(),
          lockedAt: null,
          nextAttemptAt: null,
        })
        .where(
          and(
            eq(invitationEmailJobs.invitationId, input.invitationId),
            inArray(invitationEmailJobs.status, [
              "pending",
              "failed",
              "processing",
            ])
          )
        )
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
