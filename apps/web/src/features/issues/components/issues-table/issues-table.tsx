"use client"

import { useCallback, useMemo, useState } from "react"

import { DataTableSelectionBar } from "@/components/data-table/data-table"

import { issueDeleteDialog as IssueDeleteDialog } from "../issue-delete-dialog/issue-delete-dialog"
import { IssueMetrics } from "../issue-metrics/issue-metrics"
import { safelyRunAction } from "../issue-utils/issue-values"
import { issuesTableContent as IssuesTableContent } from "../issues-table-content/issues-table-content"
import { IssuesTablePagination } from "../issues-table-pagination/issues-table-pagination"
import { IssuesTableToolbar } from "../issues-table-toolbar/issues-table-toolbar"
import type { IssuesTableProps } from "../issues-table-types"
import type { IssueUiItem } from "../types"
import {
  useIssuesTableFilters,
  useIssuesTableModel,
} from "../use-issues-table-state/use-issues-table-state"

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
  currentUserId,
  searchState,
  total,
  pageSize,
  pending,
  fetching,
  placeholder = false,
  busyIssueId,
  error,
  assignees,
  labelOptions,
  onLabelSearchChange,
  enableRowSelection = false,
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
  const handleViewChange = useCallback(
    (patch: Parameters<typeof onViewChange>[0]) => {
      void onViewChange(patch)
    },
    [onViewChange]
  )
  const filters = useIssuesTableFilters({
    searchState,
    onSearchChange,
    onViewChange,
  })
  const { table } = useIssuesTableModel({
    issues,
    organizationId,
    currentUserId,
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
    enableRowSelection,
    placeholder,
  })
  const selectedCount = table.getSelectedRowModel().rows.length
  const clearSelection = useCallback(() => table.resetRowSelection(), [table])

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
          currentUserId={currentUserId}
          pending={pending}
          searchState={searchState}
          searchDraft={filters.searchDraft}
          draft={filters.draft}
          assignees={assignees}
          labelOptions={labelOptions}
          onCreate={onCreate}
          onSearchChange={filters.handleSearchChange}
          onClearSearch={filters.clearSearch}
          onLabelSearchChange={onLabelSearchChange}
          onDraftChange={filters.updateDraft}
          onApplyDraft={filters.applyDraft}
          onResetFilters={filters.resetFilters}
          canResetFilters={filters.canResetFilters}
          onResetSort={filters.resetSort}
          canResetSort={filters.canResetSort}
          searchInputRef={filters.searchInputRef}
          onViewChange={handleViewChange}
        />
        <div
          data-slot="issues-table-results-scope"
          className="relative grid min-w-0 gap-4"
        >
          <div className="col-start-1 row-start-1 min-w-0">
            <IssuesTableContent
              table={table}
              busyIssueId={busyIssueId}
              fetching={fetching}
              error={error}
              onRetry={onRetry}
            />
          </div>
          {!error ? (
            <div className="col-start-1 row-start-2 min-w-0">
              <IssuesTablePagination
                table={table}
                searchState={searchState}
                total={total}
              />
            </div>
          ) : null}
          <div className="pointer-events-none col-start-1 row-start-1 grid">
            <DataTableSelectionBar
              selectedCount={selectedCount}
              onClear={clearSelection}
            />
          </div>
        </div>
      </div>

      <IssueDeleteDialog
        target={placeholder ? undefined : deleteTarget}
        onOpenChange={handleDeleteOpenChange}
        onConfirm={confirmDelete}
      />
    </>
  )
}
