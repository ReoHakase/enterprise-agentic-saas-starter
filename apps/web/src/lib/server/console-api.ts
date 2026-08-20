import "server-only"
import { cache } from "react"

import { createConsoleApi } from "@/features/console/api"
import { serverEnv } from "@/lib/env.server"
import { getCookieHeader } from "@/lib/server/auth"

export const createServerConsoleApi = cache(async () =>
  createConsoleApi({
    baseUrl: serverEnv.API_PUBLIC_URL,
    cookie: await getCookieHeader(),
  })
)
