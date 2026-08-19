"use client"

import { createConsoleApi } from "@/features/console"
import { clientEnv } from "@/lib/env.client"

type BrowserConsoleApi = ReturnType<typeof createConsoleApi>

let api: BrowserConsoleApi | undefined

export const getBrowserConsoleApi = (): BrowserConsoleApi => {
  api ??= createConsoleApi({
    baseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
  })
  return api
}
