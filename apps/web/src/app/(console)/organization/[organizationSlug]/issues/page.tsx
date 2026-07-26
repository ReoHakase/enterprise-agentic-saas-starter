import { dehydrate, QueryClient } from "@tanstack/react-query"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageShell } from "@/components/page-shell/page-shell"
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary/query-hydration-boundary"
import { IssuesDashboard, issuesQueryOptions } from "@/features/issues"
import { issueSearchParamsCache } from "@/features/issues/server"
import { OrganizationActivationGate } from "@/features/organizations"
import { createServerApiClient } from "@/lib/server/api-client"
import { getCookieHeader } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"
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

  await Promise.all([
    queryClient.prefetchQuery(
      issuesQueryOptions(apiClient, activeOrganization.id, issueSearchState)
    ),
    queryClient.prefetchQuery({
      queryKey: ["console", "organizations", activeOrganization.id, "members"],
      queryFn: async () =>
        (await createServerConsoleApi()).listMembers(activeOrganization.id),
    }),
  ])

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
