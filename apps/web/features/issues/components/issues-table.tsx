"use client"

import { useCallback, useMemo, useState } from "react"

import { issueDeleteDialog as IssueDeleteDialog } from "./issue-delete-dialog"
import { IssueMetrics } from "./issue-metrics"
import { safelyRunAction } from "./issue-utils"
import { issuesTableContent as IssuesTableContent } from "./issues-table-content"
import { issuesTablePagination as IssuesTablePagination } from "./issues-table-pagination"
import { issuesTableToolbar as IssuesTableToolbar } from "./issues-table-toolbar"
import type { IssuesTableProps } from "./issues-table-types"
import type { IssueUiItem } from "./types"
import {
  useIssuesTableFilters,
  useIssuesTableModel,
} from "./use-issues-table-state"

const useIssueCounts = (issues: IssueUiItem[]) =>
  useMemo(() => {
    let open = 0
    let inProgress = 0
    let closed = 0

    for (const issue of issues) {
      if (issue.status === "open") open += 1
      if (issue.status === "in_progress") inProgress += 1
      if (issue.status === "closed") closed += 1
    }

    return { closed, inProgress, open }
  }, [issues])

export const IssuesTable = ({
  issues,
  organizationId,
  searchState,
  total,
  pageSize,
  pending,
  busyIssueId,
  error,
  assignees,
  getIssueHref,
  onCreate,
  onToggle,
  onDelete,
  onUpdate,
  onSelect,
  onRetry,
  onSearchChange,
  onViewChange,
}: IssuesTableProps) => {
  const [deleteTarget, setDeleteTarget] = useState<IssueUiItem>()
  const requestDelete = useCallback(
    (issue: IssueUiItem) => setDeleteTarget(issue),
    []
  )
  const handleDeleteOpenChange = useCallback((open: boolean) => {
    if (!open) setDeleteTarget(undefined)
  }, [])
  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    safelyRunAction(onDelete(deleteTarget))
    setDeleteTarget(undefined)
  }, [deleteTarget, onDelete])
  const counts = useIssueCounts(issues)
  const filters = useIssuesTableFilters({
    searchState,
    onSearchChange,
    onViewChange,
  })
  const table = useIssuesTableModel({
    issues,
    organizationId,
    searchState,
    total,
    pageSize,
    assignees,
    getIssueHref,
    onToggle,
    onUpdate,
    onSelect,
    onViewChange,
    onRequestDelete: requestDelete,
  })

  return (
    <>
      <IssueMetrics
        open={counts.open}
        inProgress={counts.inProgress}
        closed={counts.closed}
      />

      <div className="flex min-w-0 flex-col gap-4">
        <IssuesTableToolbar
          organizationId={organizationId}
          pending={pending}
          searchState={searchState}
          searchDraft={filters.searchDraft}
          labelDraft={filters.labelDraft}
          assignees={assignees}
          onCreate={onCreate}
          onSearchChange={filters.handleSearchChange}
          onLabelChange={filters.handleLabelChange}
          onStatusChange={filters.handleStatusChange}
          onPriorityChange={filters.handlePriorityChange}
          onAssigneeChange={filters.handleAssigneeChange}
          onSortChange={filters.handleSortChange}
          onDirectionChange={filters.handleDirectionChange}
        />
        <IssuesTableContent
          table={table}
          busyIssueId={busyIssueId}
          error={error}
          onRetry={onRetry}
        />
        {!error ? (
          <IssuesTablePagination
            table={table}
            searchState={searchState}
            total={total}
          />
        ) : null}
      </div>

      <IssueDeleteDialog
        target={deleteTarget}
        onOpenChange={handleDeleteOpenChange}
        onConfirm={confirmDelete}
      />
    </>
  )
}
