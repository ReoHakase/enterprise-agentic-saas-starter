import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  member,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, count, desc, eq, gt, inArray, isNotNull } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"
import {
  ensureAgentSessionContextInTransaction,
  revokeAgentSessionContextsInTransaction,
} from "../agent/public"
import {
  normalizeOrganizationRole,
  type OrganizationRole,
} from "../authorization/public"
import { type OrganizationMember } from "./domain"

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
        profileImage: user.image,
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
      profileImage: row.profileImage,
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
      const targetRows = await tx
        .select({ role: member.role, userId: member.userId })
        .from(member)
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.id, input.memberId)
          )
        )
        .limit(1)
      const target = targetRows[0]
      if (!target) return []
      const affectedSessions =
        target.role === input.role
          ? []
          : await tx
              .select({ sessionId: session.id, userId: session.userId })
              .from(session)
              .where(
                and(
                  eq(session.userId, target.userId),
                  eq(session.activeOrganizationId, input.organizationId)
                )
              )
      const updatedRows = await tx
        .update(member)
        .set({ role: input.role })
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.id, input.memberId),
            eq(member.role, target.role)
          )
        )
        .returning()
      if (updatedRows[0]) {
        await revokeAgentSessionContextsInTransaction(tx, affectedSessions)
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "organization.member.role_updated",
          targetType: "member",
          targetId: input.memberId,
          metadata: { fromRole: target.role, toRole: input.role },
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
        .select({ role: member.role, userId: member.userId })
        .from(member)
        .where(
          and(
            eq(member.id, input.actorMemberId),
            eq(member.organizationId, input.organizationId),
            eq(member.userId, input.actorUserId)
          )
        )
        .limit(1)
      const actor = actorRows[0]
      if (actor?.role !== "super_admin") {
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

      const affectedSessions = await tx
        .select({ sessionId: session.id, userId: session.userId })
        .from(session)
        .where(
          and(
            inArray(session.userId, [actor.userId, targetRows[0].userId]),
            eq(session.activeOrganizationId, input.organizationId)
          )
        )

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
            eq(member.userId, input.actorUserId),
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

      await revokeAgentSessionContextsInTransaction(tx, affectedSessions)

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
        const affectedSessions = await tx
          .select({ sessionId: session.id, userId: session.userId })
          .from(session)
          .where(
            and(
              eq(session.userId, deletedRows[0].userId),
              eq(session.activeOrganizationId, input.organizationId)
            )
          )
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

        const now = new Date()
        for (const context of affectedSessions) {
          // oxlint-disable-next-line no-await-in-loop -- session update trigger前に全context rowを同一transactionで用意する。
          await ensureAgentSessionContextInTransaction(tx, { ...context, now })
        }
        await tx
          .update(session)
          .set({
            activeOrganizationId: replacementOrganizationId,
            updatedAt: now,
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
