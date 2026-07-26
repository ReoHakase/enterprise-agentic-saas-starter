"use client"

import { emptyAssigneeOptions } from "../issue-utils/issue-utils"
import { IssuesTable } from "../issues-table/issues-table"
import type { IssuesWorkspaceProps } from "../types/types"

export const IssuesWorkspace = ({
  issues,
  organizationId,
  searchState,
  total,
  pageSize,
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
  onSearchChange,
  onViewChange,
}: IssuesWorkspaceProps) => (
  <section className="flex min-w-0 flex-col gap-5" aria-label="Issues">
    <IssuesTable
      issues={issues}
      organizationId={organizationId}
      searchState={searchState}
      total={total}
      pageSize={pageSize}
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
      onSearchChange={onSearchChange}
      onViewChange={onViewChange}
    />
  </section>
)
