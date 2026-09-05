import { createFileRoute } from "@tanstack/react-router"

import { PageShell } from "@/components/page-shell/page-shell"
import {
  ConsoleRouteErrorBoundary,
  IssuesRouteSkeleton,
} from "@/features/console"
import { IssuesDashboard } from "@/features/issues"
import { OrganizationActivationGate } from "@/features/organizations"
import {
  consumeOrganizationIssuesRouteQuery,
  organizationIssuesQueryOptions,
} from "@/lib/server/console.functions"

export const Route = createFileRoute(
  "/_console/organization/$organizationSlug/issues/"
)({
  loader: ({ context, location, params }) =>
    consumeOrganizationIssuesRouteQuery(
      context.queryClient,
      organizationIssuesQueryOptions(
        params.organizationSlug,
        location.searchStr
      )
    ),
  head: () => ({
    meta: [
      { title: "Issues · Enterprise SaaS" },
      {
        content: "Track organization work from intake through completion.",
        name: "description",
      },
    ],
  }),
  component: () => <OrganizationIssuesRoute />,
  errorComponent: ConsoleRouteErrorBoundary,
  pendingComponent: IssuesRouteSkeleton,
  pendingMs: 0,
})

const OrganizationIssuesRoute = () => {
  const issues = Route.useLoaderData()
  const { organization } = issues

  if (issues.inactive) {
    return (
      <PageShell
        title="Issues"
        description={`Track work for ${organization.name}.`}
      >
        <OrganizationActivationGate
          organizationId={organization.id}
          organizationName={organization.name}
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Issues"
      description={`Track work for ${organization.name}. Switch organizations from the sidebar.`}
    >
      <IssuesDashboard
        organizationId={organization.id}
        organizationSlug={organization.slug}
        currentUserId={issues.currentUserId}
      />
    </PageShell>
  )
}
