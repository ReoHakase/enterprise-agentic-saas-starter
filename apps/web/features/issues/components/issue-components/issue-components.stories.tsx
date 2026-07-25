import {
  getCoreRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"
import { AgentFormRegistryProvider } from "@/features/agent"

import type {
  Issue,
  IssueActivity,
  IssueTimelineItem,
  IssueTimelinePage,
} from "../../schema"
import { defaultIssueSearchState } from "../../search-params.shared"
import { CreateIssueDialog } from "../create-issue-dialog/create-issue-dialog"
import type { StringFieldApi } from "../form-types/form-types"
import { IssueActivityItem } from "../issue-activity/issue-activity"
import { IssueComment } from "../issue-comment/issue-comment"
import { IssueDetailController } from "../issue-detail-controller/issue-detail-controller"
import { IssueDetailDialog } from "../issue-detail-dialog/issue-detail-dialog"
import {
  descriptionEditorField as DescriptionEditorField,
  titleEditorField as TitleEditorField,
} from "../issue-detail-editor-fields/issue-detail-editor-fields"
import {
  IssueActionsCell,
  IssueAssigneeSelect,
  IssueDueDateInput,
  IssuePrioritySelect,
  IssueStatusSelect,
  IssueTitleCell,
  SortableIssueHeader,
} from "../issue-inline-controls/issue-inline-controls"
import {
  IssueAssigneeControl,
  IssueDueDateTimeControl,
  IssueLabelsControl,
  IssuePriorityControl,
  IssueStatusControl,
} from "../issue-metadata-controls/issue-metadata-controls"
import { IssueMetrics } from "../issue-metrics/issue-metrics"
import { IssueModalRouteShell } from "../issue-modal-route-shell/issue-modal-route-shell"
import {
  AllIssuePrioritiesBadge,
  AllIssueStatusesBadge,
  PriorityBadge,
  StatusBadge,
} from "../issue-utils/issue-utils"
import { IssuesTable } from "../issues-table/issues-table"
import { IssuesWorkspace } from "../issues-workspace/issues-workspace"
import {
  CommentBodyFormField,
  CreateIssueTitleField,
} from "../text-form-fields/text-form-fields"
import type {
  IssueAssigneeOption,
  IssueCommentUiItem,
  IssueUiItem,
  IssueUpdate,
} from "../types/types"

const noop = fn()
const noopAsync = fn(async () => undefined)
const assignees: IssueAssigneeOption[] = [
  {
    id: "user-2",
    name: "Jordan Lee",
    email: "jordan@example.test",
    profileImage: null,
  },
]
const issue: IssueUiItem = {
  id: "issue-billing",
  number: 12,
  title: "Fix billing webhook retries",
  description: "Retry failed invoice events with an idempotency key.",
  status: "open",
  priority: "urgent",
  assigneeId: "user-2",
  creatorId: "user-1",
  labels: ["billing", "bug"],
  dueDate: "2026-07-30T09:30:00.000Z",
  revision: 1,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
  attachmentCount: 3,
  commentCount: 2,
  thumbnail: null,
}
const issues: IssueUiItem[] = [issue]
const selectedLabels = ["billing"]
const labelSuggestions = ["billing", "bug", "security"]
const sortableColumns: ColumnDef<IssueUiItem>[] = [{ accessorKey: "updatedAt" }]
const sortableInitialState = {
  sorting: [{ id: "updatedAt", desc: true }],
}
const issueRecord: Issue = {
  ...issue,
  organizationId: "org-1",
}
const activity: IssueActivity = {
  type: "activity",
  id: "activity-1",
  kind: "field_changed",
  field: "status",
  fromValue: "open",
  toValue: "in_progress",
  actor: { id: "user-1", name: "Avery Stone", profileImage: null },
  createdAt: "2026-07-11T00:00:00.000Z",
}
const comment: IssueCommentUiItem = {
  id: "comment-1",
  authorId: "user-2",
  author: { id: "user-2", name: "Jordan Lee", profileImage: null },
  body: "Verified the retry path in staging.",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
}
const timeline: IssueTimelineItem[] = [
  activity,
  {
    type: "comment",
    ...comment,
    organizationId: "org-1",
    issueId: issue.id,
  },
]
const timelinePage: IssueTimelinePage = {
  items: timeline,
  nextCursor: null,
}

const IssueStoryFrame = ({ children }: { children: React.ReactNode }) => (
  <Providers>
    <AgentFormRegistryProvider>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </AgentFormRegistryProvider>
  </Providers>
)

const changeView = async () => new URLSearchParams()
const getIssueHref = (value: IssueUiItem) =>
  `/organization/acme/issues/${value.number.toString()}`
const updateIssue = async (
  _value: IssueUiItem,
  _update: IssueUpdate
): Promise<void> => undefined
const field = (name: string, value: string): StringFieldApi => ({
  name,
  state: {
    value,
    meta: { isTouched: false, isValid: true, errors: [] },
  },
  handleBlur: noop,
  handleChange: noop,
})
const SortableHeaderFixture = () => {
  const table = useReactTable({
    columns: sortableColumns,
    data: issues,
    getCoreRowModel: getCoreRowModel(),
    initialState: sortableInitialState,
  })
  const column = table.getColumn("updatedAt")
  if (!column) return null
  return (
    <SortableIssueHeader
      column={column}
      label="Updated"
      accessibleLabel="Sort by updated date"
      showDescendingIcon
    />
  )
}

const MetadataControlsCatalogue = () => (
  <div className="grid max-w-xl gap-4">
    <IssueStatusControl
      value="open"
      includeAll
      ariaLabel="Filter by status"
      onValueChange={noop}
    />
    <IssuePriorityControl
      value="urgent"
      includeAll
      ariaLabel="Filter by priority"
      onValueChange={noop}
    />
    <IssueAssigneeControl
      value="user-2"
      assignees={assignees}
      ariaLabel="Issue assignee"
      onValueChange={noop}
    />
    <IssueLabelsControl
      value={selectedLabels}
      suggestions={labelSuggestions}
      ariaLabel="Issue labels"
      onValueChange={noop}
    />
    <IssueDueDateTimeControl
      value={issue.dueDate}
      ariaLabel="Issue due date and time"
      onValueChange={noop}
    />
  </div>
)

const InlineControlsCatalogue = () => (
  <div className="grid max-w-3xl gap-4">
    <SortableHeaderFixture />
    <IssueTitleCell issue={issue} href={getIssueHref(issue)} />
    <IssueStatusSelect issue={issue} onUpdate={updateIssue} />
    <IssuePrioritySelect issue={issue} onUpdate={updateIssue} />
    <IssueAssigneeSelect
      issue={issue}
      assignees={assignees}
      onUpdate={updateIssue}
    />
    <IssueDueDateInput issue={issue} onUpdate={updateIssue} />
    <IssueActionsCell
      issue={issue}
      onSelect={noop}
      onToggle={noopAsync}
      onRequestDelete={noop}
    />
  </div>
)

const BadgeCatalogue = () => (
  <div className="flex flex-wrap gap-3">
    <StatusBadge status="open" />
    <PriorityBadge priority="urgent" />
    <AllIssueStatusesBadge />
    <AllIssuePrioritiesBadge />
  </div>
)

const FormFieldCatalogue = () => (
  <div className="grid max-w-xl gap-6">
    <CreateIssueTitleField field={field("title", issue.title)} onEdit={noop} />
    <CommentBodyFormField
      field={field("body", comment.body)}
      id="story-comment"
      label="Comment"
      onEdit={noop}
    />
  </div>
)

const TableCatalogue = () => (
  <IssuesTable
    issues={issues}
    organizationId="org-1"
    searchState={defaultIssueSearchState}
    total={1}
    pageSize={10}
    assignees={assignees}
    getIssueHref={getIssueHref}
    onCreate={noopAsync}
    onToggle={noopAsync}
    onDelete={noopAsync}
    onUpdate={updateIssue}
    onSelect={noop}
    onRetry={noop}
    onSearchChange={noop}
    onViewChange={changeView}
  />
)

const meta = preview.meta({
  title: "Web/Issues/Component Catalogue",
  component: IssueMetrics,
  parameters: { layout: "fullscreen" },
})

export const StatusSummary = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <IssueMetrics open={4} inProgress={2} closed={7} />
    </IssueStoryFrame>
  ),
})

export const StatusAndMetadataControls = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <MetadataControlsCatalogue />
    </IssueStoryFrame>
  ),
})

export const TableInlineControls = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <InlineControlsCatalogue />
    </IssueStoryFrame>
  ),
})

export const StatusBadges = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <BadgeCatalogue />
    </IssueStoryFrame>
  ),
})

export const TextFormFields = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <FormFieldCatalogue />
    </IssueStoryFrame>
  ),
})

export const DetailEditorFields = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <div className="grid max-w-3xl gap-6">
        <TitleEditorField
          field={field("title", issue.title)}
          onEdit={noop}
          onCancel={noop}
        />
        <DescriptionEditorField
          field={field("description", issue.description)}
          onEdit={noop}
        />
      </div>
    </IssueStoryFrame>
  ),
})

export const IssueTable = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <TableCatalogue />
    </IssueStoryFrame>
  ),
})

export const IssueWorkspace = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <IssuesWorkspace
        issues={issues}
        organizationId="org-1"
        searchState={defaultIssueSearchState}
        total={1}
        pageSize={10}
        assignees={assignees}
        getIssueHref={getIssueHref}
        onCreate={noopAsync}
        onToggle={noopAsync}
        onDelete={noopAsync}
        onUpdate={updateIssue}
        onSelectIssue={noop}
        onRetry={noop}
        onSearchChange={noop}
        onViewChange={changeView}
      />
    </IssueStoryFrame>
  ),
})

export const CreateIssue = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <CreateIssueDialog organizationId="org-1" onCreate={noopAsync} />
    </IssueStoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "New issue" }))
    await waitFor(() =>
      expect(
        within(document.body).getByRole("dialog", { name: "Create issue" })
      ).toBeVisible()
    )
  },
})

export const TimelineItems = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <ol className="grid max-w-3xl">
        <IssueActivityItem activity={activity} assignees={assignees} />
        <IssueComment
          issue={issue}
          comment={comment}
          onUpdateComment={noopAsync}
          onDeleteComment={noopAsync}
        />
      </ol>
    </IssueStoryFrame>
  ),
})

export const IssueDetail = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <IssueDetailDialog
        issue={issue}
        assignees={assignees}
        timeline={timeline}
        nextCursor={null}
        canonicalHref={getIssueHref(issue)}
        organizationId="org-1"
        mode="page"
        onLoadOlder={noop}
        onUpdate={updateIssue}
        onCreateComment={noopAsync}
        onUpdateComment={noopAsync}
        onDeleteComment={noopAsync}
        onRequestClose={noop}
      />
    </IssueStoryFrame>
  ),
})

export const ControlledIssueDetail = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <IssueDetailController
        initialIssue={issueRecord}
        initialTimeline={timelinePage}
        assignees={assignees}
        labelSuggestions={labelSuggestions}
        organizationId="org-1"
        canonicalHref={getIssueHref(issue)}
        mode="page"
      />
    </IssueStoryFrame>
  ),
})

export const InterceptedRouteShell = meta.story({
  args: { open: 4, inProgress: 2, closed: 7 },
  render: () => (
    <IssueStoryFrame>
      <IssueModalRouteShell>
        <p>Issue details load inside the intercepted route shell.</p>
      </IssueModalRouteShell>
    </IssueStoryFrame>
  ),
})
