"use client"

import {
  getCoreRowModel,
  useReactTable,
  type PaginationState,
  type RowSelectionState,
} from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { pruneRowSelection } from "@/components/data-table/data-table-state"
import { useDataTableColumnVisibility } from "@/components/data-table/use-data-table-column-visibility"

import {
  defaultIssueSearchState,
  issueListQueryKeyState,
  type IssueSearchPatch,
  type IssueSearchState,
} from "../../search-params"
import { useIssueColumns } from "../issue-table-columns/issue-table-columns"
import type { IssuesTableProps } from "../issues-table-types/issues-table-types"
import {
  getIssueRowId,
  isTableSort,
} from "../issues-table-utils/issues-table-utils"
import type { IssueUiItem } from "../types/types"

const ISSUE_FILTER_DEBOUNCE_MS = 300
const issueColumnIds = [
  "select",
  "number",
  "thumbnail",
  "title",
  "status",
  "priority",
  "assignee",
  "dueDate",
  "comments",
  "files",
  "updatedAt",
  "actions",
] as const
const issueNonHideableColumnIds = ["select", "title", "actions"] as const
const defaultIssueColumnVisibility = {}
const toIssuePageSize = (value: number): IssueSearchState["pageSize"] => {
  if (value === 50) return "50"
  if (value === 100) return "100"
  return "20"
}

const filterState = (
  state: Pick<
    IssueSearchState,
    | "statuses"
    | "priorityFrom"
    | "priorityTo"
    | "assignees"
    | "labels"
    | "labelMode"
    | "dueFrom"
    | "dueTo"
    | "dueFromOffset"
    | "dueToOffset"
  >
): IssueSearchPatch => ({
  statuses: state.statuses,
  priorityFrom: state.priorityFrom,
  priorityTo: state.priorityTo,
  assignees: state.assignees,
  labels: state.labels,
  labelMode: state.labelMode,
  dueFrom: state.dueFrom,
  dueTo: state.dueTo,
  dueFromOffset: state.dueFromOffset,
  dueToOffset: state.dueToOffset,
})
const defaultFilterState = filterState(defaultIssueSearchState)
const defaultFilterStateKey = JSON.stringify(defaultFilterState)

export const useIssuesTableFilters = ({
  searchState,
  onSearchChange,
  onViewChange,
}: Pick<
  IssuesTableProps,
  "searchState" | "onSearchChange" | "onViewChange"
>) => {
  const [searchDraft, setSearchDraft] = useState(searchState.q)
  const [draft, setDraft] = useState<IssueSearchPatch>(() =>
    filterState(searchState)
  )
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<number | undefined>(undefined)
  const skipSearchDebounceRef = useRef(false)
  const {
    assignees,
    dueFrom,
    dueFromOffset,
    dueTo,
    dueToOffset,
    labelMode,
    labels,
    priorityFrom,
    priorityTo,
    statuses,
  } = searchState
  const synchronizedFilterState = useMemo(
    () =>
      filterState({
        assignees,
        dueFrom,
        dueFromOffset,
        dueTo,
        dueToOffset,
        labelMode,
        labels,
        priorityFrom,
        priorityTo,
        statuses,
      }),
    [
      assignees,
      dueFrom,
      dueFromOffset,
      dueTo,
      dueToOffset,
      labelMode,
      labels,
      priorityFrom,
      priorityTo,
      statuses,
    ]
  )
  const draftKey = JSON.stringify(draft)

  // URL更新をdebounceしつつinputの応答性を保つため、local draftを保持する。
  // oxlint-disable-next-line react-doctor/no-derived-state, react-doctor/no-derived-state-effect
  useEffect(() => setSearchDraft(searchState.q), [searchState.q])
  useEffect(() => setDraft(synchronizedFilterState), [synchronizedFilterState])
  useEffect(() => {
    if (searchTimeoutRef.current !== undefined) {
      window.clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = undefined
    }
    if (skipSearchDebounceRef.current && searchDraft === "") {
      skipSearchDebounceRef.current = false
      return
    }
    if (searchDraft === searchState.q) return
    searchTimeoutRef.current = window.setTimeout(() => {
      searchTimeoutRef.current = undefined
      onSearchChange(searchDraft)
    }, ISSUE_FILTER_DEBOUNCE_MS)
    return () => {
      if (searchTimeoutRef.current !== undefined) {
        window.clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = undefined
      }
    }
  }, [onSearchChange, searchDraft, searchState.q])

  const updateDraft = useCallback(
    <Key extends keyof IssueSearchPatch>(
      key: Key,
      value: IssueSearchPatch[Key]
    ) => setDraft((current) => ({ ...current, [key]: value })),
    []
  )
  const applyDraft = useCallback(() => {
    void onViewChange({ ...draft, page: 1 })
  }, [draft, onViewChange])
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setSearchDraft(event.target.value),
    []
  )
  const clearSearch = useCallback(() => {
    if (searchTimeoutRef.current !== undefined) {
      window.clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = undefined
    }
    skipSearchDebounceRef.current = true
    setSearchDraft("")
    onSearchChange("")
    searchInputRef.current?.focus()
  }, [onSearchChange])
  const resetFilters = useCallback(() => {
    setDraft(defaultFilterState)
    void onViewChange({ ...defaultFilterState, page: 1 })
  }, [onViewChange])
  const resetSort = useCallback(() => {
    void onViewChange({ sort: "updatedAt", dir: "desc", page: 1 })
  }, [onViewChange])
  const canResetFilters = draftKey !== defaultFilterStateKey
  const canResetSort =
    searchState.sort !== defaultIssueSearchState.sort ||
    searchState.dir !== defaultIssueSearchState.dir

  return {
    applyDraft,
    canResetFilters,
    canResetSort,
    clearSearch,
    draft,
    handleSearchChange,
    resetFilters,
    resetSort,
    searchDraft,
    searchInputRef,
    updateDraft,
  }
}

export const useIssuesTableModel = ({
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
  onRequestDelete,
  enableRowSelection = false,
  placeholder = false,
}: Pick<
  IssuesTableProps,
  | "issues"
  | "organizationId"
  | "currentUserId"
  | "searchState"
  | "total"
  | "pageSize"
  | "assignees"
  | "getIssueHref"
  | "onToggle"
  | "onUpdate"
  | "onSelect"
  | "onViewChange"
  | "enableRowSelection"
  | "placeholder"
> & {
  onRequestDelete: (issue: IssueUiItem) => void
}) => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const selectionScope = useMemo(
    () => JSON.stringify([organizationId, issueListQueryKeyState(searchState)]),
    [organizationId, searchState]
  )
  const previousSelectionScope = useRef(selectionScope)
  const visibleRowIds = useMemo(() => issues.map(getIssueRowId), [issues])
  const { columnVisibility, onColumnVisibilityChange, resetColumnVisibility } =
    useDataTableColumnVisibility({
      userId: currentUserId,
      tableId: "organization-issues",
      columnIds: issueColumnIds,
      nonHideableColumnIds: issueNonHideableColumnIds,
      defaultVisibility: defaultIssueColumnVisibility,
      storageVersion: 2,
    })
  const columns = useIssueColumns({
    organizationId,
    assignees,
    getIssueHref,
    onToggle,
    onUpdate,
    onSelect,
    onRequestDelete,
    enableRowSelection,
    disabled: placeholder,
    resetColumnVisibility,
  })

  useEffect(() => {
    const next =
      previousSelectionScope.current === selectionScope
        ? pruneRowSelection(rowSelection, visibleRowIds)
        : {}
    previousSelectionScope.current = selectionScope
    if (JSON.stringify(rowSelection) !== JSON.stringify(next)) {
      setRowSelection(next)
    }
  }, [rowSelection, selectionScope, visibleRowIds])

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
      void onViewChange(
        next.pageSize === current.pageSize
          ? { page: next.pageIndex + 1 }
          : {
              page: next.pageIndex + 1,
              pageSize: toIssuePageSize(next.pageSize),
            }
      )
    },
    [onViewChange, pageSize, searchState.page]
  )
  const table = useReactTable({
    data: issues,
    columns,
    state: {
      sorting: [{ id: searchState.sort, desc: searchState.dir === "desc" }],
      pagination: { pageIndex: searchState.page - 1, pageSize },
      rowSelection,
      columnVisibility,
      columnPinning: {
        left: enableRowSelection ? ["select"] : [],
        right: ["actions"],
      },
    },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange,
    enableRowSelection: enableRowSelection && !placeholder,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    getRowId: getIssueRowId,
  })

  return { resetColumnVisibility, table }
}
