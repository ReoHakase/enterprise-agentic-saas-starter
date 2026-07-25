import type { ApiClient } from "@enterprise-agentic-saas/api/client"

import { toConsoleApiError } from "@/features/console/api.public"

export const deleteUserProfileImage = async (client: ApiClient) => {
  const result = await client.files["profile-images"].users.me.delete()
  if (result.error) throw toConsoleApiError(result.error, result.status)
}

export const deleteOrganizationProfileImage = async (
  client: ApiClient,
  organizationId: string
) => {
  const result = await client.files["profile-images"]
    .organizations({
      organizationId,
    })
    .delete()
  if (result.error) throw toConsoleApiError(result.error, result.status)
}
