import { IssueDetailController } from "@/features/issues/components/issue-detail-controller"
import { loadIssueDetail } from "@/lib/server/issue-detail"

export default async function IssueModalPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; issueNumber: string }>
}) {
  const { organizationSlug, issueNumber } = await params
  const detail = await loadIssueDetail(organizationSlug, Number(issueNumber))
  if (detail.inactive) return null

  return (
    <IssueDetailController
      initialIssue={detail.issue}
      initialTimeline={detail.timeline}
      assignees={detail.assignees}
      labelSuggestions={detail.labelSuggestions}
      organizationId={detail.organization.id}
      canonicalHref={`/organization/${organizationSlug}/issues/${issueNumber}`}
      mode="modal"
    />
  )
}
