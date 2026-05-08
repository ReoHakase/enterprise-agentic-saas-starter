"use client"

import { createConsoleApi } from "@/lib/console-api"
import { clientEnv } from "@/lib/env.client"

export const browserConsoleApi = createConsoleApi({
  baseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
})
