import { PageShell } from "@/components/page-shell/page-shell"
import { IssueDetailController } from "@/features/issues"
import { OrganizationActivationGate } from "@/features/organizations"
import { loadIssueDetail } from "@/lib/server/issue-detail"

export default async function IssuePage({
  params,
}: {
  params: Promise<{ organizationSlug: string; issueNumber: string }>
}) {
  const { organizationSlug, issueNumber } = await params
  const detail = await loadIssueDetail(organizationSlug, Number(issueNumber))

  if (detail.inactive) {
    return (
      <PageShell title="Issue" description={detail.organization.name}>
        <OrganizationActivationGate
          organizationId={detail.organization.id}
          organizationName={detail.organization.name}
        />
      </PageShell>
    )
  }

  const canonicalHref = `/organization/${organizationSlug}/issues/${issueNumber}`
  return (
    <IssueDetailController
      initialIssue={detail.issue}
      initialTimeline={detail.timeline}
      assignees={detail.assignees}
      labelSuggestions={detail.labelSuggestions}
      organizationId={detail.organization.id}
      canonicalHref={canonicalHref}
    />
  )
}
