import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"

export const decideInvitation = async ({
  action,
  apiBaseUrl,
  invitationId,
}: {
  action: "accept" | "reject"
  apiBaseUrl: string
  invitationId: string
}) => {
  const authClient = createAuthClientForBaseUrl(apiBaseUrl)
  const result =
    action === "accept"
      ? await authClient.organization.acceptInvitation({ invitationId })
      : await authClient.organization.rejectInvitation({ invitationId })

  if (result.error) {
    throw new Error(result.error.message || "Invitation could not be updated")
  }
}
