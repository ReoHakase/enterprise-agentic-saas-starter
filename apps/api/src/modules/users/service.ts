import type { Db } from "@enterprise-agentic-saas/db"

import { publicErrors } from "../../errors/app-error"
import { listOrganizationsForUser } from "../organizations/repository"
import {
  deleteOtherSessionsForUser,
  deleteSessionForUser,
  findUserProfile,
  listSessionsForUser,
  resolveAndPersistActiveOrganizationId,
  updateUserProfile,
} from "./repository"

export const getMe = async (
  db: Db,
  input: {
    sessionId: string
    userId: string
    activeOrganizationId?: string | null
  }
) => {
  const user = await findUserProfile(db, input.userId)
  if (!user) {
    throw publicErrors.notFound("User not found", { resource: "user" })
  }

  const activeOrganizationId = await resolveAndPersistActiveOrganizationId(
    db,
    input
  )
  const organizations = await listOrganizationsForUser(db, {
    userId: input.userId,
    activeOrganizationId,
  })

  return {
    user,
    activeOrganizationId,
    organizations,
  }
}

export const updateMe = async (
  db: Db,
  input: { userId: string; name: string }
) => {
  const name = input.name.trim()
  if (!name) {
    throw publicErrors.validation("Name is required", { field: "name" })
  }

  const user = await updateUserProfile(db, { userId: input.userId, name })
  if (!user) {
    throw publicErrors.notFound("User not found", { resource: "user" })
  }
  return user
}

export const listUserSessions = async (
  db: Db,
  input: { userId: string; currentSessionId: string }
) => listSessionsForUser(db, input)

export const revokeUserSession = async (
  db: Db,
  input: { userId: string; currentSessionId: string; sessionId: string }
) => {
  if (input.sessionId === input.currentSessionId) {
    throw publicErrors.validation("Current session cannot be revoked here")
  }

  const deleted = await deleteSessionForUser(db, input)
  if (!deleted) {
    throw publicErrors.notFound("Session not found", {
      resource: "session",
    })
  }

  return { id: deleted.id }
}

export const revokeOtherUserSessions = async (
  db: Db,
  input: { userId: string; currentSessionId: string }
) => deleteOtherSessionsForUser(db, input)
