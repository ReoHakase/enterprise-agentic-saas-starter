import { HttpError } from "../../errors/http-error"
import type { UsersPorts } from "./ports"

export const createUsersService = (ports: UsersPorts) => {
  const getMe = async (input: {
    sessionId: string
    userId: string
    activeOrganizationId?: string | null
  }) => {
    const user = await ports.findUser(input.userId)
    if (!user) {
      throw new HttpError({ code: "not_found" })
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
      throw new HttpError({
        code: "validation_error",
        fieldErrors: { name: ["Enter a display name."] },
        publicMessage: "A display name is required.",
      })
    }

    const user = await ports.updateUser({ userId: input.userId, name })
    if (!user) {
      throw new HttpError({ code: "not_found" })
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
      throw new HttpError({
        code: "validation_error",
        publicMessage: "The current session cannot be revoked here.",
      })
    }

    const deleted = await ports.deleteSession(input)
    if (!deleted) {
      throw new HttpError({ code: "not_found" })
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
