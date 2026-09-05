import { verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"

export const getConsoleContext = async (loginRedirectTo?: string) => {
  const [session, api] = await Promise.all([
    verifySession(loginRedirectTo),
    createServerConsoleApi(),
  ])
  const me = await api.getMe()

  return { api, me, session }
}
