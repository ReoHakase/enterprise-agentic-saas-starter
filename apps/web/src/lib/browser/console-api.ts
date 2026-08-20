"use client"

import { createConsoleApi } from "@/features/console/api"
import { clientEnv } from "@/lib/env.client"

type BrowserConsoleApi = ReturnType<typeof createConsoleApi>

export const browserConsoleApi: BrowserConsoleApi = createConsoleApi({
  baseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
})
