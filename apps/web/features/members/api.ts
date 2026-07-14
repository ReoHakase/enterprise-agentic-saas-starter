import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"

import { safeAuthErrorMessage } from "@/features/auth/error"

export const invitationFallbacks = {
  accept: "Invitation could not be accepted. Try again.",
  reject: "Invitation could not be rejected. Try again.",
} as const

export class InvitationDecisionError extends Error {
  override name = "InvitationDecisionError"
}

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
  try {
    const result =
      action === "accept"
        ? await authClient.organization.acceptInvitation({ invitationId })
        : await authClient.organization.rejectInvitation({ invitationId })

    if (result.error) {
      throw new InvitationDecisionError(
        safeAuthErrorMessage(result.error, invitationFallbacks[action])
      )
    }
  } catch (error) {
    if (error instanceof InvitationDecisionError) throw error
    throw new InvitationDecisionError(invitationFallbacks[action])
  }
}
