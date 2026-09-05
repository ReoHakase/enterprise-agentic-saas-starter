import {
  createApiClient,
  type ApiClient,
} from "@enterprise-agentic-saas/api/client"

import { clientEnv } from "@/lib/env"

export const apiClient: ApiClient = createApiClient(
  clientEnv.VITE_API_BASE_URL,
  {
    fetch: {
      credentials: "include",
    },
  }
)
