import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { redirect } from "@tanstack/react-router"
import { getRequestHeader } from "@tanstack/react-start/server"

import { serverEnv } from "@/lib/env.server"
import { readAuthSessionResult } from "@/lib/server/auth-session-response"
import { parseSession, type Session } from "@/lib/server/auth-session-schema"

export type { Session } from "@/lib/server/auth-session-schema"

export const getCookieHeader = async () => getRequestHeader("cookie") ?? ""

export const getSession = async (): Promise<Session | null> => {
  const cookie = await getCookieHeader()
  const serverAuthClient = createAuthClientForBaseUrl(serverEnv.API_PUBLIC_URL)

  const result = await serverAuthClient.getSession({
    fetchOptions: {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    },
  })

  const session = readAuthSessionResult(result)
  return parseSession(session)
}

export const verifySession = async (redirectTo?: string) => {
  const session = await getSession()

  if (!session) {
    const safeRedirectTo =
      redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
        ? redirectTo
        : undefined
    const signInPath = safeRedirectTo
      ? `/auth/sign-in?${new URLSearchParams({ redirectTo: safeRedirectTo }).toString()}`
      : "/auth/sign-in"
    throw redirect({ href: signInPath })
  }

  return session
}
