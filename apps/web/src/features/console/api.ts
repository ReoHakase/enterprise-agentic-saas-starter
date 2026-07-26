import { createApiClient } from "@enterprise-agentic-saas/api/client"

import {
  parseMe,
  parseUserProfile,
  parseUserSessions,
} from "@/features/account"
import {
  parseBulkInvitationResponse,
  parseInvitations,
  parseMembers,
  parseResendInvitationResponse,
} from "@/features/members"
import {
  parseOrganizationDeletionReceipt,
  parseOrganization,
  parseOrganizations,
  type OrganizationRole,
} from "@/features/organizations"

import { ConsoleApiError, toConsoleApiError } from "./error"

type ConsoleApiOptions = {
  baseUrl: string
  cookie?: string
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

export { ConsoleApiError, toConsoleApiError } from "./error"

export const createConsoleApi = ({ baseUrl, cookie }: ConsoleApiOptions) => {
  const client = createApiClient(baseUrl, {
    fetch: {
      cache: "no-store",
      credentials: "include",
    },
    headers: cookie ? { cookie } : undefined,
  })

  return {
    getMe: async (signal?: AbortSignal) =>
      parseMe(unwrap(await client.me.get({ fetch: { signal } }))),
    updateMe: async (body: { name: string }) =>
      parseUserProfile(unwrap(await client.me.patch(body))),
    listSessions: async (signal?: AbortSignal) =>
      parseUserSessions(
        unwrap(await client.me.sessions.get({ fetch: { signal } }))
      ),
    revokeSession: async (sessionId: string) =>
      unwrap(await client.me.sessions({ sessionId }).delete()),
    revokeOtherSessions: async () => unwrap(await client.me.sessions.delete()),
    listOrganizations: async (signal?: AbortSignal) =>
      parseOrganizations(
        unwrap(await client.organizations.get({ fetch: { signal } }))
      ),
    createOrganization: async (body: {
      name: string
      slug: string
      keepCurrentActiveOrganization?: boolean
    }) => parseOrganization(unwrap(await client.organizations.post(body))),
    activateOrganization: async (organizationId: string) =>
      unwrap(await client.organizations({ organizationId }).activate.post()),
    getOrganization: async (organizationId: string, signal?: AbortSignal) =>
      parseOrganization(
        unwrap(
          await client
            .organizations({ organizationId })
            .get({ fetch: { signal } })
        )
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
    listMembers: async (organizationId: string, signal?: AbortSignal) =>
      parseMembers(
        unwrap(
          await client
            .organizations({ organizationId })
            .members.get({ fetch: { signal } })
        )
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
    listInvitations: async (organizationId: string, signal?: AbortSignal) =>
      parseInvitations(
        unwrap(
          await client
            .organizations({ organizationId })
            .invitations.get({ fetch: { signal } })
        )
      ),
    createInvitations: async (
      organizationId: string,
      body: {
        emails: string[]
        role: Exclude<OrganizationRole, "super_admin">
      }
    ) =>
      parseBulkInvitationResponse(
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
    resendInvitation: async (organizationId: string, invitationId: string) =>
      parseResendInvitationResponse(
        unwrap(
          await client
            .organizations({ organizationId })
            .invitations({ invitationId })
            .resend.post()
        )
      ),
  }
}
