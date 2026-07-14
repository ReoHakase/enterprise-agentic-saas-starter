import { createApiClient } from "@enterprise-agentic-saas/api/client"

import {
  parseMe,
  parseUserProfile,
  parseUserSessions,
} from "@/features/account/schema"
import {
  parseInvitation,
  parseInvitations,
  parseMembers,
} from "@/features/members/schema"
import {
  parseOrganizationDeletionReceipt,
  parseOrganization,
  parseOrganizations,
  type OrganizationRole,
} from "@/features/organizations/schema"

type ConsoleApiOptions = {
  baseUrl: string
  cookie?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isErrorContextValue = (
  value: unknown
): value is string | number | boolean | null | undefined =>
  value === null ||
  value === undefined ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"

const errorContextKeys = new Set([
  "action",
  "constraint",
  "field",
  "maxAgeSeconds",
  "reason",
  "resource",
  "retryAfter",
])
const unsafeFieldSegments = new Set(["__proto__", "constructor", "prototype"])

const isSafeFieldPath = (value: string) => {
  const segments = value.split(".")
  return (
    segments.length > 0 &&
    segments.length <= 8 &&
    segments.every(
      (segment) =>
        /^[A-Za-z0-9_-]{1,64}$/u.test(segment) &&
        !unsafeFieldSegments.has(segment)
    )
  )
}

const getErrorContext = (
  value: unknown
): ConsoleApiErrorContext | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const context: ConsoleApiErrorContext = {}
  for (const [key, contextValue] of Object.entries(value)) {
    if (errorContextKeys.has(key) && isErrorContextValue(contextValue)) {
      context[key] = contextValue
    }
  }
  return context
}

const getFieldErrors = (value: unknown): ConsoleApiFieldErrors | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const fieldErrors: ConsoleApiFieldErrors = {}
  for (const [field, messages] of Object.entries(value)) {
    if (
      isSafeFieldPath(field) &&
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every((message) => typeof message === "string")
    ) {
      fieldErrors[field] = [...messages]
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
}

const getErrorPayload = (value: unknown) => {
  if (!isRecord(value) || !isRecord(value.error)) {
    return {}
  }

  const { code, context, fieldErrors, message } = value.error
  return {
    code: typeof code === "string" ? code : undefined,
    context: getErrorContext(context),
    fieldErrors: getFieldErrors(fieldErrors),
    message: typeof message === "string" ? message : undefined,
  }
}

export type ConsoleApiErrorContext = Record<
  string,
  string | number | boolean | null | undefined
>
export type ConsoleApiFieldErrors = Record<string, string[]>

export class ConsoleApiError extends Error {
  readonly code: string
  readonly context: ConsoleApiErrorContext
  readonly fieldErrors: ConsoleApiFieldErrors
  readonly status: number

  constructor({
    code,
    context,
    fieldErrors,
    message,
    status,
  }: {
    code: string
    context?: ConsoleApiErrorContext
    fieldErrors?: ConsoleApiFieldErrors
    message: string
    status: number
  }) {
    super(message)
    this.name = "ConsoleApiError"
    this.code = code
    this.context = context ?? {}
    this.fieldErrors = fieldErrors ?? {}
    this.status = status
  }
}

export const isStepUpRequiredError = (
  error: unknown
): error is ConsoleApiError =>
  error instanceof ConsoleApiError && error.code === "step_up_required"

export const toConsoleApiError = (error: unknown, status: number) => {
  const value = isRecord(error) && "value" in error ? error.value : error
  const payload = getErrorPayload(value)
  return new ConsoleApiError({
    code: payload.code ?? "request_failed",
    context: payload.context,
    fieldErrors: payload.fieldErrors,
    message: payload.message ?? "Request failed",
    status,
  })
}

type EdenResult<T> =
  | {
      data: T
      error: null
      status: number
    }
  | {
      data: null
      error: {
        status: unknown
        value: unknown
      }
      status: number
    }

const unwrap = <T>(result: EdenResult<T>): T => {
  if (result.error) {
    throw toConsoleApiError(result.error, result.status)
  }

  if (result.data === null || result.data === undefined) {
    throw new ConsoleApiError({
      code: "invalid_response",
      message: "API response did not include data",
      status: result.status,
    })
  }

  return result.data
}

export const createConsoleApi = ({ baseUrl, cookie }: ConsoleApiOptions) => {
  const client = createApiClient(baseUrl, {
    fetch: {
      cache: "no-store",
      credentials: "include",
    },
    headers: cookie ? { cookie } : undefined,
  })

  return {
    getMe: async () => parseMe(unwrap(await client.me.get())),
    updateMe: async (body: { name: string }) =>
      parseUserProfile(unwrap(await client.me.patch(body))),
    listSessions: async () =>
      parseUserSessions(unwrap(await client.me.sessions.get())),
    revokeSession: async (sessionId: string) =>
      unwrap(await client.me.sessions({ sessionId }).delete()),
    revokeOtherSessions: async () => unwrap(await client.me.sessions.delete()),
    listOrganizations: async () =>
      parseOrganizations(unwrap(await client.organizations.get())),
    createOrganization: async (body: {
      name: string
      slug: string
      keepCurrentActiveOrganization?: boolean
    }) => parseOrganization(unwrap(await client.organizations.post(body))),
    activateOrganization: async (organizationId: string) =>
      unwrap(await client.organizations({ organizationId }).activate.post()),
    getOrganization: async (organizationId: string) =>
      parseOrganization(
        unwrap(await client.organizations({ organizationId }).get())
      ),
    updateOrganization: async (
      organizationId: string,
      body: { name?: string; slug?: string }
    ) =>
      parseOrganization(
        unwrap(await client.organizations({ organizationId }).patch(body))
      ),
    deleteOrganization: async (
      organizationId: string,
      body: {
        slug: string
        confirmation: "DELETE"
        idempotencyKey: string
      }
    ) =>
      parseOrganizationDeletionReceipt(
        unwrap(await client.organizations({ organizationId }).delete(body))
      ),
    listMembers: async (organizationId: string) =>
      parseMembers(
        unwrap(await client.organizations({ organizationId }).members.get())
      ),
    updateMemberRole: async (
      organizationId: string,
      memberId: string,
      role: Exclude<OrganizationRole, "super_admin">
    ) =>
      parseMembers(
        unwrap(
          await client
            .organizations({ organizationId })
            .members({ memberId })
            .patch({ role })
        )
      ),
    transferSuperAdmin: async (
      organizationId: string,
      body: { memberId: string; confirmation: string }
    ) => {
      const organizationRoutes = client.organizations({ organizationId })
      return parseMembers(
        unwrap(await organizationRoutes["ownership-transfer"].post(body))
      )
    },
    removeMember: async (
      organizationId: string,
      memberId: string,
      confirmation: string
    ) =>
      unwrap(
        await client
          .organizations({ organizationId })
          .members({ memberId })
          .delete({ confirmation })
      ),
    listInvitations: async (organizationId: string) =>
      parseInvitations(
        unwrap(await client.organizations({ organizationId }).invitations.get())
      ),
    createInvitation: async (
      organizationId: string,
      body: { email: string; role: Exclude<OrganizationRole, "super_admin"> }
    ) =>
      parseInvitation(
        unwrap(
          await client.organizations({ organizationId }).invitations.post(body)
        )
      ),
    cancelInvitation: async (organizationId: string, invitationId: string) =>
      unwrap(
        await client
          .organizations({ organizationId })
          .invitations({ invitationId })
          .delete()
      ),
  }
}
