"use client"

import { emptyAssigneeOptions } from "./issue-utils"
import { IssuesTable } from "./issues-table"
import type { IssuesWorkspaceProps } from "./types"

export const IssuesWorkspace = ({
  issues,
  pending,
  busyIssueId,
  error,
  onCreate,
  onToggle,
  onDelete,
  onUpdate,
  assignees = emptyAssigneeOptions,
  getIssueHref,
  onSelectIssue,
  onRetry,
}: IssuesWorkspaceProps) => (
  <section className="flex min-w-0 flex-col gap-5" aria-label="Issues">
    <IssuesTable
      issues={issues}
      pending={pending}
      busyIssueId={busyIssueId}
      error={error}
      assignees={assignees}
      getIssueHref={getIssueHref}
      onCreate={onCreate}
      onToggle={onToggle}
      onDelete={onDelete}
      onUpdate={onUpdate}
      onSelect={onSelectIssue}
      onRetry={onRetry}
    />
  </section>
)
