import "server-only"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { serverEnv } from "@/lib/env.server"

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

export const getCookieHeader = async () => {
  const requestHeaders = await headers()
  return requestHeaders.get("cookie") ?? ""
}

export const getSession = async (): Promise<Session | null> => {
  const cookie = await getCookieHeader()

  const response = await fetch(`${serverEnv.API_PUBLIC_URL}/auth/get-session`, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  })

  if (!response.ok) {
    return null
  }

  const session: Session | null = await response.json()
  return session?.user ? session : null
}

export const verifySession = async () => {
  const session = await getSession()

  if (!session) {
    redirect("/auth/sign-in")
  }

  return session
}
