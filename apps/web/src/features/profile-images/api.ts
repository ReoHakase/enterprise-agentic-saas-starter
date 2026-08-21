import {
  unwrapEdenResult,
  type ApiClient,
} from "@enterprise-agentic-saas/api/client"

export const deleteUserProfileImage = async (client: ApiClient) => {
  unwrapEdenResult(await client.files["profile-images"].users.me.delete())
}

export const deleteOrganizationProfileImage = async (
  client: ApiClient,
  organizationId: string
) => {
  unwrapEdenResult(
    await client.files["profile-images"]
      .organizations({
        organizationId,
      })
      .delete()
  )
}
