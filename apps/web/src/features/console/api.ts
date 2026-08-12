import { createApiClient } from "@enterprise-agentic-saas/api/client"

import {
  parseMe,
  parseUserProfile,
  parseUserSessions,
} from "@/features/account"
import { parseMcpOAuthCredentials } from "@/features/mcp-oauth/schema"
import { parseInvitations, parseMembers } from "@/features/members"
import {
  parseOrganizationDeletionReceipt,
  parseOrganization,
  parseOrganizations,
  type OrganizationRole,
} from "@/features/organizations"

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
  if (result.error) throw result.error
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
    listMcpOAuthSessions: async (signal?: AbortSignal) =>
      parseMcpOAuthCredentials(
        unwrap(await client.me["mcp-oauth"].sessions.get({ fetch: { signal } }))
      ),
    revokeMcpOAuthSession: async (credentialId: string) =>
      unwrap(await client.me["mcp-oauth"].sessions({ credentialId }).delete()),
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
      role: Exclude<OrganizationRole, "owner">
    ) =>
      parseMembers(
        unwrap(
          await client
            .organizations({ organizationId })
            .members({ memberId })
            .patch({ role })
        )
      ),
    transferOwnership: async (
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
    cancelInvitation: async (organizationId: string, invitationId: string) =>
      unwrap(
        await client
          .organizations({ organizationId })
          .invitations({ invitationId })
          .delete()
      ),
  }
}
