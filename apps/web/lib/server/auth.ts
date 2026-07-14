import "server-only"
import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { serverEnv } from "@/lib/env.server"
import { readAuthSessionResult } from "@/lib/server/auth-session-response"

export type SessionUser = {
  id: string
  email: string
  name?: string | null
}

export type Session = {
  session: {
    id: string
    userId: string
    expiresAt: string | Date
  }
  user: SessionUser
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isSession = (value: unknown): value is Session =>
  isRecord(value) &&
  isRecord(value.session) &&
  typeof value.session.id === "string" &&
  typeof value.session.userId === "string" &&
  (typeof value.session.expiresAt === "string" ||
    value.session.expiresAt instanceof Date) &&
  isRecord(value.user) &&
  typeof value.user.id === "string" &&
  typeof value.user.email === "string"

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
  return isSession(session) ? session : null
})

export const verifySession = async () => {
  const session = await getSession()

  if (!session) {
    redirect("/auth/sign-in")
  }

  return session
}
