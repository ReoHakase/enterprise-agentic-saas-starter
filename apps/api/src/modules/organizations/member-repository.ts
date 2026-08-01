import type { Db } from "@enterprise-agentic-saas/db"
import {
  account,
  auditLogs,
  member,
  passkey,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, count, desc, eq, gt, inArray, isNotNull } from "drizzle-orm"

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
  const githubAccounts = db
    .select({ userId: account.userId })
    .from(account)
    .where(eq(account.providerId, "github"))
    .groupBy(account.userId)
    .as("github_accounts")
  const passkeyUsers = db
    .select({ userId: passkey.userId })
    .from(passkey)
    .groupBy(passkey.userId)
    .as("passkey_users")
  const rows = await db
    .select({
      id: member.id,
      userId: member.userId,
      name: user.name,
      email: user.email,
      profileImage: user.image,
      githubLinkedUserId: githubAccounts.userId,
      passkeyLinkedUserId: passkeyUsers.userId,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .leftJoin(githubAccounts, eq(githubAccounts.userId, member.userId))
    .leftJoin(passkeyUsers, eq(passkeyUsers.userId, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(user.name)

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    profileImage: row.profileImage,
    githubLinked: row.githubLinkedUserId !== null,
    passkeyLinked: row.passkeyLinkedUserId !== null,
    role: normalizeOrganizationRole(row.role),
    createdAt: row.createdAt.toISOString(),
  }))
}

export const countOwners = async (db: Db, organizationId: string) => {
  const rows = await db
    .select({ value: count() })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.role, "owner"))
    )
  return rows[0]?.value ?? 0
}

export const findMemberById = async (
  db: Db,
  input: { organizationId: string; memberId: string }
) => {
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
}

export type TransferOwnershipResult =
  | "actor_not_owner"
  | "invalid_owner_count"
  | "target_not_found"
  | "transferred"

export const transferOwnershipById = async (
  db: Db,
  input: {
    actorMemberId: string
    actorUserId: string
    organizationId: string
    targetMemberId: string
  }
): Promise<TransferOwnershipResult> =>
  await db.transaction(async (tx) => {
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
    if (actor?.role !== "owner") {
      return "actor_not_owner"
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
          eq(member.role, "owner")
        )
      )
    if (beforeCount[0]?.value !== 1) {
      return "invalid_owner_count"
    }

    const demotedRows = await tx
      .update(member)
      .set({ role: "admin" })
      .where(
        and(
          eq(member.id, input.actorMemberId),
          eq(member.organizationId, input.organizationId),
          eq(member.userId, input.actorUserId),
          eq(member.role, "owner")
        )
      )
      .returning({ id: member.id })
    if (!demotedRows[0]) {
      return "actor_not_owner"
    }

    const promotedRows = await tx
      .update(member)
      .set({ role: "owner" })
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
          eq(member.role, "owner")
        )
      )
    if (afterCount[0]?.value !== 1) {
      throw new Error("Ownership transfer violated owner invariant")
    }

    await revokeAgentSessionContextsInTransaction(tx, affectedSessions)

    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "organization.owner.transferred",
      targetType: "member",
      targetId: input.targetMemberId,
      metadata: { previousOwnerMemberId: input.actorMemberId },
    })

    return "transferred"
  })

export const deleteMemberById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    memberId: string
    removedRole: OrganizationRole
  }
) => {
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
}
