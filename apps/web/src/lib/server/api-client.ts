import {
  createApiClient,
  type ApiClient,
} from "@enterprise-agentic-saas/api/client"

import { serverEnv } from "@/lib/env.server"

export const createServerApiClient = (cookie: string): ApiClient =>
  createApiClient(serverEnv.API_PUBLIC_URL, {
    headers: cookie ? { cookie } : undefined,
  })
