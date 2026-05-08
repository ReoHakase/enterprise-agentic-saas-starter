import type { Db } from "@enterprise-agentic-saas/db"
import {
  member,
  organization,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"

export type UserProfile = {
  id: string
  name: string
  email: string
  image: string | null
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
        image: user.image,
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
        image: user.image,
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

export const findFallbackActiveOrganizationId = async (
  db: Db,
  userId: string
) => {
  try {
    const rows = await db
      .select({ id: organization.id })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId))
      .orderBy(organization.name)
      .limit(1)

    return rows[0]?.id ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "users",
      operation: "findFallbackActiveOrganizationId",
    })
  }
}
