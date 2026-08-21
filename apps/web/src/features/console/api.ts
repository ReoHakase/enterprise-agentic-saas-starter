import {
  createApiClient,
  unwrapEdenResult,
} from "@enterprise-agentic-saas/api/client"

import type { OrganizationRole } from "@/features/organizations/schema"

type ConsoleApiOptions = {
  baseUrl: string
  cookie?: string
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
      unwrapEdenResult(await client.me.get({ fetch: { signal } })),
    updateMe: async (body: { name: string }) =>
      unwrapEdenResult(await client.me.patch(body)),
    listSessions: async (signal?: AbortSignal) =>
      unwrapEdenResult(await client.me.sessions.get({ fetch: { signal } })),
    revokeSession: async (sessionId: string) =>
      unwrapEdenResult(await client.me.sessions({ sessionId }).delete()),
    revokeOtherSessions: async () =>
      unwrapEdenResult(await client.me.sessions.delete()),
    listMcpOAuthSessions: async (signal?: AbortSignal) =>
      unwrapEdenResult(
        await client.me["mcp-oauth"].sessions.get({ fetch: { signal } })
      ),
    revokeMcpOAuthSession: async (credentialId: string) =>
      unwrapEdenResult(
        await client.me["mcp-oauth"].sessions({ credentialId }).delete()
      ),
    listOrganizations: async (signal?: AbortSignal) =>
      unwrapEdenResult(await client.organizations.get({ fetch: { signal } })),
    createOrganization: async (body: {
      name: string
      slug: string
      keepCurrentActiveOrganization?: boolean
    }) => unwrapEdenResult(await client.organizations.post(body)),
    activateOrganization: async (organizationId: string) =>
      unwrapEdenResult(
        await client.organizations({ organizationId }).activate.post()
      ),
    getOrganization: async (organizationId: string, signal?: AbortSignal) =>
      unwrapEdenResult(
        await client
          .organizations({ organizationId })
          .get({ fetch: { signal } })
      ),
    updateOrganization: async (
      organizationId: string,
      body: { name?: string; slug?: string }
    ) =>
      unwrapEdenResult(
        await client.organizations({ organizationId }).patch(body)
      ),
    deleteOrganization: async (
      organizationId: string,
      body: {
        slug: string
        confirmation: "DELETE"
        idempotencyKey: string
      }
    ) =>
      unwrapEdenResult(
        await client.organizations({ organizationId }).delete(body)
      ),
    listMembers: async (organizationId: string, signal?: AbortSignal) =>
      unwrapEdenResult(
        await client
          .organizations({ organizationId })
          .members.get({ fetch: { signal } })
      ),
    updateMemberRole: async (
      organizationId: string,
      memberId: string,
      role: Exclude<OrganizationRole, "owner">
    ) =>
      unwrapEdenResult(
        await client
          .organizations({ organizationId })
          .members({ memberId })
          .patch({ role })
      ),
    transferOwnership: async (
      organizationId: string,
      body: { memberId: string; confirmation: string }
    ) => {
      const organizationRoutes = client.organizations({ organizationId })
      return unwrapEdenResult(
        await organizationRoutes["ownership-transfer"].post(body)
      )
    },
    removeMember: async (
      organizationId: string,
      memberId: string,
      confirmation: string
    ) =>
      unwrapEdenResult(
        await client
          .organizations({ organizationId })
          .members({ memberId })
          .delete({ confirmation })
      ),
    listInvitations: async (organizationId: string, signal?: AbortSignal) =>
      unwrapEdenResult(
        await client
          .organizations({ organizationId })
          .invitations.get({ fetch: { signal } })
      ),
    cancelInvitation: async (organizationId: string, invitationId: string) =>
      unwrapEdenResult(
        await client
          .organizations({ organizationId })
          .invitations({ invitationId })
          .delete()
      ),
  }
}
