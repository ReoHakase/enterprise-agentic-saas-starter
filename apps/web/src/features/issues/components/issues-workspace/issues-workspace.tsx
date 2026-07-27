"use client"

import { emptyAssigneeOptions } from "../issue-utils/issue-utils"
import { IssuesTable } from "../issues-table/issues-table"
import type { IssuesWorkspaceProps } from "../types/types"

const emptyLabelOptions: string[] = []
const ignoreLabelSearch = () => undefined

export const IssuesWorkspace = ({
  issues,
  organizationId,
  currentUserId = "anonymous",
  searchState,
  total,
  pageSize,
  pending,
  fetching,
  placeholder,
  busyIssueId,
  error,
  onCreate,
  onToggle,
  onDelete,
  onUpdate,
  assignees = emptyAssigneeOptions,
  labelOptions = emptyLabelOptions,
  onLabelSearchChange = ignoreLabelSearch,
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
      currentUserId={currentUserId}
      searchState={searchState}
      total={total}
      pageSize={pageSize}
      pending={pending}
      fetching={fetching}
      placeholder={placeholder}
      busyIssueId={busyIssueId}
      error={error}
      assignees={assignees}
      labelOptions={labelOptions}
      onLabelSearchChange={onLabelSearchChange}
      enableRowSelection
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
