"use client"

import { createConsoleApi } from "@/features/console"
import { clientEnv } from "@/lib/env.client"

type BrowserConsoleApi = ReturnType<typeof createConsoleApi>

let api: BrowserConsoleApi | undefined

const getBrowserConsoleApi = () => {
  api ??= createConsoleApi({
    baseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
  })
  return api
}

const browserConsoleApiTarget: BrowserConsoleApi = Object.create(null)

export const browserConsoleApi = new Proxy(browserConsoleApiTarget, {
  get: (_target, property) => Reflect.get(getBrowserConsoleApi(), property),
})
