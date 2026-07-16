import "server-only"
import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { serverEnv } from "@/lib/env.server"
import { readAuthSessionResult } from "@/lib/server/auth-session-response"
import { parseSession, type Session } from "@/lib/server/auth-session-schema"

export type { Session } from "@/lib/server/auth-session-schema"

const serverAuthClient = createAuthClientForBaseUrl(serverEnv.API_PUBLIC_URL)

export const getCookieHeader = cache(async () => {
  const requestHeaders = await headers()
  return requestHeaders.get("cookie") ?? ""
})

export const getSession = cache(async (): Promise<Session | null> => {
  const cookie = await getCookieHeader()

  const result = await serverAuthClient.getSession({
    fetchOptions: {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    },
  })

  const session = readAuthSessionResult(result)
  return parseSession(session)
})

export const verifySession = async () => {
  const session = await getSession()

  if (!session) {
    redirect("/auth/sign-in")
  }

  return session
}
