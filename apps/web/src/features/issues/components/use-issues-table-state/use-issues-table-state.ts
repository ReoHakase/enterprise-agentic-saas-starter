"use client"

import {
  getCoreRowModel,
  useReactTable,
  type PaginationState,
} from "@tanstack/react-table"
import { useCallback, useEffect, useState, type ChangeEvent } from "react"

import type { IssueSearchState } from "../../search-params"
import { useIssueColumns } from "../issue-table-columns/issue-table-columns"
import type { IssuesTableProps } from "../issues-table-types/issues-table-types"
import {
  getIssueRowId,
  isTableSort,
} from "../issues-table-utils/issues-table-utils"
import type { IssueUiItem } from "../types/types"

const ISSUE_FILTER_DEBOUNCE_MS = 300

export const useIssuesTableFilters = ({
  searchState,
  onSearchChange,
  onViewChange,
}: Pick<
  IssuesTableProps,
  "searchState" | "onSearchChange" | "onViewChange"
>) => {
  const [searchDraft, setSearchDraft] = useState(searchState.q)
  const [labelDraft, setLabelDraft] = useState(searchState.label)
  const handleStatusChange = useCallback(
    (value: IssueSearchState["status"]) => {
      void onViewChange({ status: value, page: 1 })
    },
    [onViewChange]
  )
  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchDraft(event.target.value)
    },
    []
  )
  const handlePriorityChange = useCallback(
    (value: IssueSearchState["priority"]) => {
      void onViewChange({ priority: value, page: 1 })
    },
    [onViewChange]
  )
  const handleAssigneeChange = useCallback(
    (value: string | null) =>
      void onViewChange({ assignee: value ?? "", page: 1 }),
    [onViewChange]
  )
  const handleLabelChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setLabelDraft(event.target.value)
    },
    []
  )
  const handleSortChange = useCallback(
    (value: string | null) => {
      if (!isTableSort(value)) return
      void onViewChange({ sort: value, page: 1 })
    },
    [onViewChange]
  )
  const handleDirectionChange = useCallback(
    (value: string | null) => {
      if (value !== "asc" && value !== "desc") return
      void onViewChange({ dir: value, page: 1 })
    },
    [onViewChange]
  )

  useEffect(() => setSearchDraft(searchState.q), [searchState.q])
  useEffect(() => setLabelDraft(searchState.label), [searchState.label])
  useEffect(() => {
    if (searchDraft === searchState.q) return
    const timeout = window.setTimeout(
      () => onSearchChange(searchDraft),
      ISSUE_FILTER_DEBOUNCE_MS
    )
    return () => window.clearTimeout(timeout)
  }, [onSearchChange, searchDraft, searchState.q])
  useEffect(() => {
    if (labelDraft === searchState.label) return
    const timeout = window.setTimeout(() => {
      void onViewChange({ label: labelDraft, page: 1 }, { history: "replace" })
    }, ISSUE_FILTER_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [labelDraft, onViewChange, searchState.label])

  return {
    handleAssigneeChange,
    handleDirectionChange,
    handleLabelChange,
    handlePriorityChange,
    handleSearchChange,
    handleSortChange,
    handleStatusChange,
    labelDraft,
    searchDraft,
  }
}

export const useIssuesTableModel = ({
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
  onRequestDelete,
}: Pick<
  IssuesTableProps,
  | "issues"
  | "organizationId"
  | "searchState"
  | "total"
  | "pageSize"
  | "assignees"
  | "getIssueHref"
  | "onToggle"
  | "onUpdate"
  | "onSelect"
  | "onViewChange"
> & {
  onRequestDelete: (issue: IssueUiItem) => void
}) => {
  const columns = useIssueColumns({
    organizationId,
    assignees,
    getIssueHref,
    onToggle,
    onUpdate,
    onSelect,
    onRequestDelete,
  })
  const handleSortingChange = useCallback(
    (
      updater:
        | { id: string; desc: boolean }[]
        | ((
            current: { id: string; desc: boolean }[]
          ) => { id: string; desc: boolean }[])
    ) => {
      const current = [
        { id: searchState.sort, desc: searchState.dir === "desc" },
      ]
      const next = typeof updater === "function" ? updater(current) : updater
      const sort = next[0]
      if (!sort || !isTableSort(sort.id)) return
      void onViewChange({
        sort: sort.id,
        dir: sort.desc ? "desc" : "asc",
        page: 1,
      })
    },
    [onViewChange, searchState.dir, searchState.sort]
  )
  const handlePaginationChange = useCallback(
    (
      updater: PaginationState | ((current: PaginationState) => PaginationState)
    ) => {
      const current = { pageIndex: searchState.page - 1, pageSize }
      const next = typeof updater === "function" ? updater(current) : updater
      void onViewChange({ page: next.pageIndex + 1 })
    },
    [onViewChange, pageSize, searchState.page]
  )

  return useReactTable({
    data: issues,
    columns,
    state: {
      sorting: [{ id: searchState.sort, desc: searchState.dir === "desc" }],
      pagination: { pageIndex: searchState.page - 1, pageSize },
    },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    getRowId: getIssueRowId,
  })
}
