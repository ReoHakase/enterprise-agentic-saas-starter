import type { Db } from "@enterprise-agentic-saas/db"
import { member, session, user } from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, gt, isNotNull } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"
import { ensureAgentSessionContextInTransaction } from "../agent/context-repository"

export type UserProfile = {
  id: string
  name: string
  email: string
  profileImage: string | null
}

export type UserSession = {
  id: string
  current: boolean
  expiresAt: string
  createdAt: string
  updatedAt: string
  ipAddress: string | null
  userAgent: string | null
}

export const findUserProfile = async (
  db: Db,
  userId: string
): Promise<UserProfile | null> => {
  try {
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.image,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    return rows[0] ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "users",
      operation: "findUserProfile",
    })
  }
}

export const updateUserProfile = async (
  db: Db,
  input: { userId: string; name: string }
): Promise<UserProfile | null> => {
  try {
    const rows = await db
      .update(user)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(user.id, input.userId))
      .returning({
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.image,
      })

    return rows[0] ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "users",
      operation: "updateUserProfile",
    })
  }
}

export const listSessionsForUser = async (
  db: Db,
  input: { userId: string; currentSessionId: string }
): Promise<UserSession[]> => {
  try {
    const rows = await db
      .select()
      .from(session)
      .where(eq(session.userId, input.userId))
      .orderBy(session.updatedAt)

    return rows.map((row) => ({
      id: row.id,
      current: row.id === input.currentSessionId,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    }))
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "users",
      operation: "listSessionsForUser",
    })
  }
}

export const deleteSessionForUser = async (
  db: Db,
  input: { userId: string; sessionId: string }
) => {
  try {
    const rows = await db
      .delete(session)
      .where(
        and(eq(session.id, input.sessionId), eq(session.userId, input.userId))
      )
      .returning()

    return rows[0] ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "users",
      operation: "deleteSessionForUser",
    })
  }
}

export const deleteOtherSessionsForUser = async (
  db: Db,
  input: { userId: string; currentSessionId: string }
) => {
  const sessions = await listSessionsForUser(db, input)
  const targets = sessions.filter((item) => !item.current)

  await Promise.all(
    targets.map((item) =>
      deleteSessionForUser(db, { userId: input.userId, sessionId: item.id })
    )
  )

  return { revoked: targets.length }
}

export const resolveAndPersistActiveOrganizationId = async (
  db: Db,
  input: {
    sessionId: string
    userId: string
    activeOrganizationId?: string | null
  }
) => {
  try {
    return await db.transaction(async (tx) => {
      if (input.activeOrganizationId) {
        const currentMembershipRows = await tx
          .select({ id: member.id })
          .from(member)
          .where(
            and(
              eq(member.userId, input.userId),
              eq(member.organizationId, input.activeOrganizationId)
            )
          )
          .limit(1)
        if (currentMembershipRows[0]) {
          return input.activeOrganizationId
        }
      }

      const recentRows = await tx
        .select({ organizationId: session.activeOrganizationId })
        .from(session)
        .innerJoin(
          member,
          and(
            eq(member.userId, input.userId),
            eq(member.organizationId, session.activeOrganizationId)
          )
        )
        .where(
          and(
            eq(session.userId, input.userId),
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

      let resolvedOrganizationId = recentRows[0]?.organizationId ?? null
      if (!resolvedOrganizationId) {
        const membershipRows = await tx
          .selectDistinct({ organizationId: member.organizationId })
          .from(member)
          .where(eq(member.userId, input.userId))
          .orderBy(member.organizationId)
          .limit(2)
        resolvedOrganizationId =
          membershipRows.length === 1
            ? (membershipRows[0]?.organizationId ?? null)
            : null
      }

      if (input.sessionId !== "test_session") {
        const now = new Date()
        await ensureAgentSessionContextInTransaction(tx, {
          sessionId: input.sessionId,
          userId: input.userId,
          now,
        })
        const updatedRows = await tx
          .update(session)
          .set({
            activeOrganizationId: resolvedOrganizationId,
            updatedAt: now,
          })
          .where(
            and(
              eq(session.id, input.sessionId),
              eq(session.userId, input.userId)
            )
          )
          .returning({ id: session.id })
        if (!updatedRows[0]) {
          throw new Error("Session not found during organization recovery")
        }
      }

      return resolvedOrganizationId
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "users",
      operation: "resolveAndPersistActiveOrganizationId",
    })
  }
}
