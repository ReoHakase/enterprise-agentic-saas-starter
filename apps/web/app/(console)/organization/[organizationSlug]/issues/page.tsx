import { dehydrate, QueryClient } from "@tanstack/react-query"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { IssuesDashboard } from "@/components/issues-dashboard"
import { PageShell } from "@/components/page-shell"
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary"
import { issuesQueryOptions } from "@/features/issues/queries"
import { issueSearchParamsCache } from "@/features/issues/search-params.server"
import { OrganizationActivationGate } from "@/features/organizations/components/organization-activation-gate"
import { createServerApiClient } from "@/lib/server/api-client"
import { getCookieHeader } from "@/lib/server/auth"
import { getConsoleContext } from "@/lib/server/console-context"

export const metadata: Metadata = {
  title: "Issues",
  description: "Track organization work from intake through completion.",
}

export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ organizationSlug }, issueSearchState] = await Promise.all([
    params,
    issueSearchParamsCache.parse(searchParams),
  ])
  const [{ me }, cookie] = await Promise.all([
    getConsoleContext(),
    getCookieHeader(),
  ])
  const apiClient = createServerApiClient(cookie)
  const queryClient = new QueryClient()
  const activeOrganization = me.organizations.find(
    (organization) => organization.slug === organizationSlug
  )

  if (!activeOrganization) {
    notFound()
  }

  if (!activeOrganization.active) {
    return (
      <PageShell
        title="Issues"
        description={`Track work for ${activeOrganization.name}.`}
      >
        <OrganizationActivationGate
          organizationId={activeOrganization.id}
          organizationName={activeOrganization.name}
        />
      </PageShell>
    )
  }

  await queryClient.prefetchQuery(
    issuesQueryOptions(apiClient, activeOrganization.id, issueSearchState)
  )

  return (
    <PageShell
      title="Issues"
      description={`Track work for ${activeOrganization.name}. Switch organizations from the sidebar.`}
    >
      <QueryHydrationBoundary state={dehydrate(queryClient)}>
        <IssuesDashboard
          organizationId={activeOrganization.id}
          organizationSlug={activeOrganization.slug}
        />
      </QueryHydrationBoundary>
    </PageShell>
  )
}
