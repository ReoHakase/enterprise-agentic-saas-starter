import { env } from "../../env"
import { publicErrors } from "../../errors/app-error"

export type SessionUser = {
  id: string
  email: string
  name?: string | null
  image?: string | null
}

export type SessionContext = {
  id: string
  activeOrganizationId?: string | null
}

export const getSessionUser = async (
  request: Request
): Promise<SessionUser> => {
  const { user } = await getSessionContext(request)
  return user
}

export const getSessionContext = async (
  request: Request
): Promise<{ session: SessionContext; user: SessionUser }> => {
  const testUserId = request.headers.get("x-test-user-id")
  if (env.NODE_ENV === "test" && testUserId) {
    return {
      session: {
        id: request.headers.get("x-test-session-id") ?? "test_session",
        activeOrganizationId:
          request.headers.get("x-test-active-organization-id") ?? null,
      },
      user: {
        id: testUserId,
        email: `${testUserId}@example.test`,
        name: "Test User",
      },
    }
  }

  if (!request.headers.get("cookie")) {
    throw publicErrors.unauthorized()
  }

  const { auth } = await import("@enterprise-agentic-saas/auth")
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session?.user) {
    throw publicErrors.unauthorized()
  }

  return {
    session: {
      id: session.session.id,
      activeOrganizationId: session.session.activeOrganizationId,
    },
    user: session.user,
  }
}
