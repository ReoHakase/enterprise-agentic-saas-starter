import { queryOptions } from "@tanstack/react-query"

import { browserConsoleApi } from "@/lib/browser/console-api"

export const consoleKeys = {
  all: ["console"] as const,
  me: () => [...consoleKeys.all, "me"] as const,
  organizations: () => [...consoleKeys.all, "organizations"] as const,
  organization: (organizationId: string) =>
    [...consoleKeys.organizations(), organizationId] as const,
  members: (organizationId: string) =>
    [...consoleKeys.organization(organizationId), "members"] as const,
  invitations: (organizationId: string) =>
    [...consoleKeys.organization(organizationId), "invitations"] as const,
  sessions: () => [...consoleKeys.all, "sessions"] as const,
}

export const organizationsQueryOptions = () =>
  queryOptions({
    queryKey: consoleKeys.organizations(),
    queryFn: ({ signal }) => browserConsoleApi.listOrganizations(signal),
  })

export const membersQueryOptions = (
  organizationId: string,
  scope?: "agent-mention-candidates"
) =>
  queryOptions({
    queryKey: scope
      ? [...consoleKeys.members(organizationId), scope]
      : consoleKeys.members(organizationId),
    queryFn: ({ signal }) =>
      browserConsoleApi.listMembers(organizationId, signal),
    enabled: organizationId.length > 0,
  })

export const invitationsQueryOptions = (
  organizationId: string,
  enabled = true
) =>
  queryOptions({
    queryKey: consoleKeys.invitations(organizationId),
    queryFn: ({ signal }) =>
      browserConsoleApi.listInvitations(organizationId, signal),
    enabled: organizationId.length > 0 && enabled,
  })

export const sessionsQueryOptions = () =>
  queryOptions({
    queryKey: consoleKeys.sessions(),
    queryFn: ({ signal }) => browserConsoleApi.listSessions(signal),
  })
