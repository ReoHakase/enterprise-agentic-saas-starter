import type { QueryClient } from "@tanstack/react-query"

import type { Me } from "@/features/account/schema"
import { consoleKeys } from "@/features/console/queries"
import { issueKeys } from "@/features/issues/queries"
import type { OrganizationSummary } from "@/features/organizations/schema"

const markActiveOrganization = (
  organizations: OrganizationSummary[],
  organizationId: string
) =>
  organizations.map((organization) => ({
    ...organization,
    active: organization.id === organizationId,
  }))

export const cacheActiveOrganization = (
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

export const prepareOrganizationSwitch = async (
  queryClient: QueryClient,
  organizationId: string
) => {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: consoleKeys.all }),
    queryClient.cancelQueries({ queryKey: issueKeys.all }),
  ])
  cacheActiveOrganization(queryClient, organizationId)
}
