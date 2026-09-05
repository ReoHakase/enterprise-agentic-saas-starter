"use client"

import { createConsoleApi } from "@/features/console/api"
import { clientEnv } from "@/lib/env"

type BrowserConsoleApi = ReturnType<typeof createConsoleApi>

export const browserConsoleApi: BrowserConsoleApi = createConsoleApi({
  baseUrl: clientEnv.VITE_API_BASE_URL,
})
