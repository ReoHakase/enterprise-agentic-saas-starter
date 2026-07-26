import "server-only"
import { cache } from "react"

import { verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"

export const getConsoleContext = cache(async () => {
  const [session, api] = await Promise.all([
    verifySession(),
    createServerConsoleApi(),
  ])
  const me = await api.getMe()

  return { api, me, session }
})
