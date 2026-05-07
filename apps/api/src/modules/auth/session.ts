import { env } from "../../env"
import { publicErrors } from "../../errors/app-error"

export type SessionUser = {
  id: string
  email: string
  name?: string | null
}

export const getSessionUser = async (
  request: Request
): Promise<SessionUser> => {
  const testUserId = request.headers.get("x-test-user-id")
  if (env.NODE_ENV === "test" && testUserId) {
    return {
      id: testUserId,
      email: `${testUserId}@example.test`,
      name: "Test User",
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

  return session.user
}
