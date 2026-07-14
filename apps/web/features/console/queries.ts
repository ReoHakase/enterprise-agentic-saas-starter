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

export const meQueryOptions = () =>
  queryOptions({
    queryKey: consoleKeys.me(),
    queryFn: browserConsoleApi.getMe,
  })

export const organizationsQueryOptions = () =>
  queryOptions({
    queryKey: consoleKeys.organizations(),
    queryFn: browserConsoleApi.listOrganizations,
  })

export const organizationQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: consoleKeys.organization(organizationId),
    queryFn: () => browserConsoleApi.getOrganization(organizationId),
    enabled: organizationId.length > 0,
  })

export const membersQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: consoleKeys.members(organizationId),
    queryFn: () => browserConsoleApi.listMembers(organizationId),
    enabled: organizationId.length > 0,
  })

export const invitationsQueryOptions = (
  organizationId: string,
  enabled = true
) =>
  queryOptions({
    queryKey: consoleKeys.invitations(organizationId),
    queryFn: () => browserConsoleApi.listInvitations(organizationId),
    enabled: organizationId.length > 0 && enabled,
  })

export const sessionsQueryOptions = () =>
  queryOptions({
    queryKey: consoleKeys.sessions(),
    queryFn: browserConsoleApi.listSessions,
  })
