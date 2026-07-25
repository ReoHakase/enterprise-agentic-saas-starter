import type { QueryClient } from "@tanstack/react-query"

import type { Me } from "@/features/account/schema.public"
import { agentKeys } from "@/features/agent/queries.public"
import { consoleKeys } from "@/features/console/queries.public"
import { fileKeys } from "@/features/files/queries.public"
import { cancelActiveFileUploads } from "@/features/files/uploads.public"
import { issueKeys } from "@/features/issues/queries.public"

import type { OrganizationSummary } from "./schema"

const markActiveOrganization = (
  organizations: OrganizationSummary[],
  organizationId: string
) =>
  organizations.map((organization) => ({
    ...organization,
    active: organization.id === organizationId,
  }))

const cacheActiveOrganization = (
  queryClient: QueryClient,
  organizationId: string
) => {
  queryClient.setQueryData<OrganizationSummary[]>(
    consoleKeys.organizations(),
    (organizations) =>
      organizations
        ? markActiveOrganization(organizations, organizationId)
        : organizations
  )
  queryClient.setQueryData<Me>(consoleKeys.me(), (me) =>
    me
      ? {
          ...me,
          activeOrganizationId: organizationId,
          organizations: markActiveOrganization(
            me.organizations,
            organizationId
          ),
        }
      : me
  )
}

const cancelTenantWorkForOrganizationSwitch = async (
  queryClient: QueryClient
) => {
  cancelActiveFileUploads()
  await Promise.all([
    queryClient.cancelQueries({ queryKey: consoleKeys.all }),
    queryClient.cancelQueries({ queryKey: fileKeys.all }),
    queryClient.cancelQueries({ queryKey: issueKeys.all }),
    queryClient.cancelQueries({ queryKey: agentKeys.all }),
  ])
  // Removing a still-observed query causes TanStack Query to recreate it
  // before the route switches, after the server already changed the active
  // tenant. Remove inactive entries here; the owner component removes its
  // exact query after it unmounts.
  queryClient.removeQueries({ queryKey: fileKeys.all, type: "inactive" })
  queryClient.removeQueries({ queryKey: agentKeys.all, type: "inactive" })
}

export const prepareOrganizationSwitch = async (
  queryClient: QueryClient,
  organizationId: string
) => {
  await cancelTenantWorkForOrganizationSwitch(queryClient)
  cacheActiveOrganization(queryClient, organizationId)
}
