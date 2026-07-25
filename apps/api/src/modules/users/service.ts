import { publicErrors } from "../../errors/app-error"
import type { UsersPorts } from "./ports"

export const createUsersService = (ports: UsersPorts) => {
  const getMe = async (input: {
    sessionId: string
    userId: string
    activeOrganizationId?: string | null
  }) => {
    const user = await ports.findUser(input.userId)
    if (!user) {
      throw publicErrors.notFound("User not found", { resource: "user" })
    }

    const activeOrganizationId = await ports.resolveActiveOrganization(input)
    const organizations = await ports.listOrganizations({
      userId: input.userId,
      activeOrganizationId,
    })

    return {
      user,
      activeOrganizationId,
      organizations,
    }
  }

  const updateMe = async (input: { userId: string; name: string }) => {
    const name = input.name.trim()
    if (!name) {
      throw publicErrors.validation("Name is required", { field: "name" })
    }

    const user = await ports.updateUser({ userId: input.userId, name })
    if (!user) {
      throw publicErrors.notFound("User not found", { resource: "user" })
    }
    return user
  }

  const listUserSessions = (input: {
    userId: string
    currentSessionId: string
  }) => ports.listSessions(input)

  const revokeUserSession = async (input: {
    userId: string
    currentSessionId: string
    sessionId: string
  }) => {
    if (input.sessionId === input.currentSessionId) {
      throw publicErrors.validation("Current session cannot be revoked here")
    }

    const deleted = await ports.deleteSession(input)
    if (!deleted) {
      throw publicErrors.notFound("Session not found", {
        resource: "session",
      })
    }

    return { id: deleted.id }
  }

  const revokeOtherUserSessions = (input: {
    userId: string
    currentSessionId: string
  }) => ports.deleteOtherSessions(input)

  return {
    getMe,
    listUserSessions,
    revokeOtherUserSessions,
    revokeUserSession,
    updateMe,
  }
}

export type UsersService = ReturnType<typeof createUsersService>
