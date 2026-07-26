import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import * as v from "valibot"

import { safeAuthErrorMessage } from "@/features/auth"

export const invitationFallbacks = {
  accept: "Invitation could not be accepted. Try again.",
  reject: "Invitation could not be rejected. Try again.",
} as const

export class InvitationDecisionError extends Error {
  override name = "InvitationDecisionError"
}

export class InvitationAuthenticationError extends Error {
  override name = "InvitationAuthenticationError"
}

const invitationDateSchema = v.union([v.string(), v.date()])

const invitationContextSchema = v.object({
  id: v.string(),
  organizationId: v.string(),
  organizationName: v.string(),
  organizationSlug: v.string(),
  inviterEmail: v.pipe(v.string(), v.email()),
  role: v.picklist(["admin", "member"]),
  status: v.literal("pending"),
  expiresAt: invitationDateSchema,
  createdAt: invitationDateSchema,
})

export type InvitationContext = Omit<
  v.InferOutput<typeof invitationContextSchema>,
  "createdAt" | "expiresAt"
> & {
  createdAt: string
  expiresAt: string
}

export type InvitationContextResult =
  | { kind: "ready"; invitation: InvitationContext }
  | { kind: "signed_out" }
  | { kind: "recipient_mismatch" }
  | { kind: "load_error" }
  | { kind: "unavailable" }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const invitationErrorValue = (error: unknown, key: string) =>
  isRecord(error) ? error[key] : undefined

const isRecipientMismatch = (error: unknown) => {
  const code = invitationErrorValue(error, "code")
  const status = invitationErrorValue(error, "status")
  const statusCode = invitationErrorValue(error, "statusCode")
  return (
    code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION" ||
    status === 403 ||
    statusCode === 403
  )
}

const isInvitationAuthenticationError = (error: unknown) => {
  const code = invitationErrorValue(error, "code")
  const status = invitationErrorValue(error, "status")
  const statusCode = invitationErrorValue(error, "statusCode")
  return (
    code === "UNAUTHORIZED" ||
    code === "SESSION_EXPIRED" ||
    code === "INVALID_SESSION" ||
    status === 401 ||
    statusCode === 401
  )
}

const isTerminalInvitationError = (error: unknown) => {
  const code = invitationErrorValue(error, "code")
  const status = invitationErrorValue(error, "status")
  const statusCode = invitationErrorValue(error, "statusCode")
  return code === "INVITATION_NOT_FOUND" || status === 400 || statusCode === 400
}

const toIsoString = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export const getInvitationContext = async ({
  apiBaseUrl,
  cookie,
  invitationId,
}: {
  apiBaseUrl: string
  cookie?: string
  invitationId: string
}): Promise<InvitationContextResult> => {
  const authClient = createAuthClientForBaseUrl(apiBaseUrl)

  try {
    const result = await authClient.organization.getInvitation({
      query: { id: invitationId },
      fetchOptions: {
        cache: "no-store",
        credentials: "include",
        headers: cookie ? { cookie } : undefined,
      },
    })

    if (result.error) {
      if (isRecipientMismatch(result.error)) {
        return { kind: "recipient_mismatch" }
      }
      if (isInvitationAuthenticationError(result.error)) {
        return { kind: "signed_out" }
      }
      return isTerminalInvitationError(result.error)
        ? { kind: "unavailable" }
        : { kind: "load_error" }
    }
    if (!result.data) {
      return { kind: "load_error" }
    }

    const invitation = v.parse(invitationContextSchema, result.data)
    return {
      kind: "ready",
      invitation: {
        ...invitation,
        createdAt: toIsoString(invitation.createdAt),
        expiresAt: toIsoString(invitation.expiresAt),
      },
    }
  } catch {
    return { kind: "load_error" }
  }
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
      if (isInvitationAuthenticationError(result.error)) {
        throw new InvitationAuthenticationError()
      }
      throw new InvitationDecisionError(
        safeAuthErrorMessage(result.error, invitationFallbacks[action])
      )
    }
  } catch (error) {
    if (
      error instanceof InvitationAuthenticationError ||
      error instanceof InvitationDecisionError
    ) {
      throw error
    }
    if (isInvitationAuthenticationError(error)) {
      throw new InvitationAuthenticationError()
    }
    throw new InvitationDecisionError(invitationFallbacks[action])
  }
}
