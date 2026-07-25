import type { ReactNode } from "react"

import {
  IssueAssigneeControl,
  IssueDueDateTimeControl,
  IssueLabelsControl,
  IssuePriorityControl,
  IssueStatusControl,
} from "./issue-metadata-controls"
import type { IssueAssigneeOption, IssueUiItem } from "./types"
import type { IssueImmediateFieldsState } from "./use-issue-immediate-fields"

const MetadataField = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <div className="flex min-w-0 flex-col gap-2">
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {label}
    </p>
    {children}
  </div>
)

export const issueDetailMetadata = ({
  issue,
  assignees,
  labelSuggestions,
  canUpdate,
  fields,
}: {
  issue: IssueUiItem
  assignees: IssueAssigneeOption[]
  labelSuggestions: string[]
  canUpdate: boolean
  fields: IssueImmediateFieldsState
}) => (
  <aside
    data-slot="issue-metadata"
    className="flex min-w-0 flex-col gap-5 border-t pt-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
    aria-label="Issue metadata"
  >
    <div>
      <h2 className="font-medium">Details</h2>
      <p className="text-xs text-muted-foreground">
        Changes apply immediately.
      </p>
    </div>
    <MetadataField label="Status">
      <IssueStatusControl
        value={issue.status}
        ariaLabel="Issue status"
        disabled={!canUpdate}
        busy={fields.isFieldSaving("status")}
        onValueChange={fields.changeStatus}
      />
    </MetadataField>
    <MetadataField label="Priority">
      <IssuePriorityControl
        value={issue.priority}
        ariaLabel="Issue priority"
        disabled={!canUpdate}
        busy={fields.isFieldSaving("priority")}
        onValueChange={fields.changePriority}
      />
    </MetadataField>
    <MetadataField label="Assignee">
      <IssueAssigneeControl
        value={issue.assigneeId}
        assignees={assignees}
        ariaLabel="Issue assignee"
        disabled={!canUpdate}
        busy={fields.isFieldSaving("assigneeId")}
        onValueChange={fields.changeAssignee}
      />
    </MetadataField>
    <MetadataField label="Labels">
      <IssueLabelsControl
        value={issue.labels}
        suggestions={labelSuggestions}
        ariaLabel="Issue labels"
        disabled={!canUpdate}
        busy={fields.isFieldSaving("labels")}
        onValueChange={fields.changeLabels}
      />
    </MetadataField>
    <MetadataField label="Due date and time">
      <IssueDueDateTimeControl
        value={issue.dueDate}
        ariaLabel="Issue due date and time"
        disabled={!canUpdate}
        busy={fields.isFieldSaving("dueDate")}
        onValueChange={fields.changeDueDate}
      />
    </MetadataField>
  </aside>
)
