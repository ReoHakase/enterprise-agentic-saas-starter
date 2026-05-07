import {
  createApiClient,
  type ApiClient,
} from "@enterprise-agentic-saas/api/client"

import { clientEnv } from "@/lib/env.client"

export const apiClient: ApiClient = createApiClient(
  clientEnv.NEXT_PUBLIC_API_BASE_URL,
  {
    fetch: {
      credentials: "include",
    },
  }
)
