import { createFileRoute, notFound } from "@tanstack/react-router"

import { PageShell } from "@/components/page-shell/page-shell"
import {
  ConsoleRouteErrorBoundary,
  IssuesRouteSkeleton,
} from "@/features/console"
import { IssueDetailController } from "@/features/issues"
import { OrganizationActivationGate } from "@/features/organizations"
import { loadOrganizationIssueDetail } from "@/lib/server/console.functions"

export const Route = createFileRoute(
  "/_console/organization/$organizationSlug/issues/$issueNumber"
)({
  loader: ({ params }) => {
    const issueNumber = Number(params.issueNumber)
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw notFound()

    return loadOrganizationIssueDetail({
      data: { issueNumber, organizationSlug: params.organizationSlug },
    })
  },
  component: () => <OrganizationIssueRoute />,
  errorComponent: ConsoleRouteErrorBoundary,
  pendingComponent: IssuesRouteSkeleton,
})

const OrganizationIssueRoute = () => {
  const detail = Route.useLoaderData()
  const { issueNumber, organizationSlug } = Route.useParams()
  const { organization } = detail

  if (detail.inactive) {
    return (
      <PageShell title="Issue" description={organization.name}>
        <OrganizationActivationGate
          organizationId={organization.id}
          organizationName={organization.name}
        />
      </PageShell>
    )
  }

  return (
    <IssueDetailController
      initialIssue={detail.issue}
      initialTimeline={detail.timeline}
      assignees={detail.assignees}
      labelSuggestions={detail.labelSuggestions}
      organizationId={organization.id}
      canonicalHref={`/organization/${organizationSlug}/issues/${issueNumber}`}
    />
  )
}
