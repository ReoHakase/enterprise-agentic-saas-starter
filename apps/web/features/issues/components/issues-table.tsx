"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@enterprise-agentic-saas/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type PaginationState,
} from "@tanstack/react-table"
import {
  CircleDotIcon,
  FlagIcon,
  ListFilterIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useMemo, useState, type ChangeEvent } from "react"

import type {
  IssueSearchState,
  SetIssueSearchState,
} from "@/features/issues/search-params"

import { CreateIssueDialog } from "./create-issue-dialog"
import { IssueMetrics } from "./issue-metrics"
import { useIssueColumns } from "./issue-table-columns"
import { IssueMutationContext } from "./issue-table-state"
import { safelyRunAction, statusOptions } from "./issue-utils"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "./types"

const getIssueRowId = (issue: IssueUiItem) => issue.id
const tablePriorityOptions = [
  { label: "All priorities", value: "all" },
  { label: "No priority", value: "no_priority" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
] as const
const tableSortOptions = [
  { label: "Updated", value: "updatedAt" },
  { label: "Created", value: "createdAt" },
  { label: "Number", value: "number" },
  { label: "Due date", value: "dueDate" },
  { label: "Priority", value: "priority" },
  { label: "Status", value: "status" },
] as const
const tableDirectionOptions = [
  { label: "Descending", value: "desc" },
  { label: "Ascending", value: "asc" },
] as const
const isTablePriority = (
  value: string | null
): value is IssueSearchState["priority"] =>
  value === "all" ||
  value === "no_priority" ||
  value === "low" ||
  value === "medium" ||
  value === "high" ||
  value === "urgent"
const isTableSort = (value: string | null): value is IssueSearchState["sort"] =>
  value === "number" ||
  value === "createdAt" ||
  value === "updatedAt" ||
  value === "dueDate" ||
  value === "priority" ||
  value === "status"

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
}: {
  organizationId: string
  issues: IssueUiItem[]
  searchState: IssueSearchState
  total: number
  pageSize: number
  pending?: boolean
  busyIssueId?: string
  error?: string
  assignees: IssueAssigneeOption[]
  getIssueHref: (issue: IssueUiItem) => string
  onCreate: AsyncAction<[title: string]>
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onDelete: AsyncAction<[issue: IssueUiItem]>
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  onSelect: (issue: IssueUiItem) => void
  onRetry?: () => void
  onSearchChange: (query: string) => void
  onViewChange: SetIssueSearchState
}) => {
  const [deleteTarget, setDeleteTarget] = useState<IssueUiItem>()
  const assigneeFilterOptions = useMemo(
    () => [
      { label: "All assignees", value: "all" },
      ...assignees.map((assignee) => ({
        label: assignee.name,
        value: assignee.id,
      })),
    ],
    [assignees]
  )
  const requestDelete = useCallback(
    (issue: IssueUiItem) => setDeleteTarget(issue),
    []
  )
  const columns = useIssueColumns({
    assignees,
    getIssueHref,
    onToggle,
    onUpdate,
    onSelect,
    onRequestDelete: requestDelete,
  })
  const table = useReactTable({
    data: issues,
    columns,
    state: {
      sorting: [{ id: searchState.sort, desc: searchState.dir === "desc" }],
      pagination: { pageIndex: searchState.page - 1, pageSize },
    },
    onSortingChange: (updater) => {
      const current = [
        { id: searchState.sort, desc: searchState.dir === "desc" },
      ]
      const next = typeof updater === "function" ? updater(current) : updater
      const sort = next[0]
      if (!sort) return
      if (
        sort.id !== "number" &&
        sort.id !== "createdAt" &&
        sort.id !== "updatedAt" &&
        sort.id !== "dueDate" &&
        sort.id !== "priority" &&
        sort.id !== "status"
      ) {
        return
      }
      void onViewChange({
        sort: sort.id,
        dir: sort.desc ? "desc" : "asc",
        page: 1,
      })
    },
    onPaginationChange: (updater) => {
      const current: PaginationState = {
        pageIndex: searchState.page - 1,
        pageSize,
      }
      const next = typeof updater === "function" ? updater(current) : updater
      void onViewChange({ page: next.pageIndex + 1 })
    },
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    getRowId: getIssueRowId,
  })
  const [openCount, inProgressCount, closedCount] = useMemo(() => {
    let open = 0
    let inProgress = 0
    let closed = 0

    for (const issue of issues) {
      if (issue.status === "open") open += 1
      if (issue.status === "in_progress") inProgress += 1
      if (issue.status === "closed") closed += 1
    }

    return [open, inProgress, closed]
  }, [issues])
  const handleStatusChange = useCallback(
    (value: string | null) => {
      if (
        value !== "all" &&
        value !== "open" &&
        value !== "in_progress" &&
        value !== "closed"
      ) {
        return
      }
      void onViewChange({ status: value, page: 1 })
    },
    [onViewChange]
  )
  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSearchChange(event.target.value)
    },
    [onSearchChange]
  )
  const handlePriorityChange = useCallback(
    (value: string | null) => {
      if (!isTablePriority(value)) return
      void onViewChange({
        priority: value,
        page: 1,
      })
    },
    [onViewChange]
  )
  const handleAssigneeChange = useCallback(
    (value: string | null) => {
      if (!value) return
      void onViewChange({ assignee: value === "all" ? "" : value, page: 1 })
    },
    [onViewChange]
  )
  const handleLabelChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      void onViewChange(
        { label: event.target.value, page: 1 },
        { history: "replace" }
      )
    },
    [onViewChange]
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
  const showPreviousPage = useCallback(() => table.previousPage(), [table])
  const showNextPage = useCallback(() => table.nextPage(), [table])
  const handleDeleteOpenChange = useCallback((open: boolean) => {
    if (!open) setDeleteTarget(undefined)
  }, [])
  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      safelyRunAction(onDelete(deleteTarget))
      setDeleteTarget(undefined)
    }
  }, [deleteTarget, onDelete])

  return (
    <>
      <IssueMetrics
        open={openCount}
        inProgress={inProgressCount}
        closed={closedCount}
      />

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">Organization issues</h2>
            <p className="text-sm text-muted-foreground">
              Track work with searchable, sortable, tenant-scoped issues.
            </p>
          </div>
          <div className="shrink-0">
            <CreateIssueDialog
              organizationId={organizationId}
              pending={pending}
              onCreate={onCreate}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <InputGroup className="md:max-w-md">
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={searchState.q}
                onChange={handleSearchChange}
                placeholder="Search issues"
                aria-label="Search issues"
              />
            </InputGroup>
            <Select
              items={statusOptions}
              value={searchState.status}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-full md:w-44">
                <ListFilterIcon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {statusOptions.find(
                    (option) => option.value === searchState.status
                  )?.label ?? "All issues"}
                </span>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={tablePriorityOptions}
              value={searchState.priority}
              onValueChange={handlePriorityChange}
            >
              <SelectTrigger className="w-full md:w-44">
                <FlagIcon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {tablePriorityOptions.find(
                    (option) => option.value === searchState.priority
                  )?.label ?? "All priorities"}
                </span>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {tablePriorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InputGroup>
              <InputGroupInput
                value={searchState.label}
                onChange={handleLabelChange}
                placeholder="Filter by label"
                aria-label="Filter issues by label"
              />
            </InputGroup>
            <Select
              items={assigneeFilterOptions}
              value={searchState.assignee || "all"}
              onValueChange={handleAssigneeChange}
            >
              <SelectTrigger className="w-full">
                {assigneeFilterOptions.find(
                  (option) => option.value === (searchState.assignee || "all")
                )?.label ?? "All assignees"}
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {assigneeFilterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={tableSortOptions}
              value={searchState.sort}
              onValueChange={handleSortChange}
            >
              <SelectTrigger className="w-full">
                Sort:{" "}
                {tableSortOptions.find(
                  (option) => option.value === searchState.sort
                )?.label ?? "Updated"}
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {tableSortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={tableDirectionOptions}
              value={searchState.dir}
              onValueChange={handleDirectionChange}
            >
              <SelectTrigger className="w-full">
                {tableDirectionOptions.find(
                  (option) => option.value === searchState.dir
                )?.label ?? "Descending"}
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {tableDirectionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <Empty className="border" role="alert">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <RefreshCwIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Issues could not be loaded</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              {onRetry ? (
                <EmptyContent>
                  <Button variant="outline" onClick={onRetry}>
                    <RefreshCwIcon
                      data-icon="inline-start"
                      aria-hidden="true"
                    />
                    Try again
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <IssueMutationContext.Provider value={busyIssueId}>
                <Table scrollLabel="Organization issues">
                  <TableCaption className="sr-only">
                    Issues for the active organization
                  </TableCaption>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.length > 0 ? (
                      table.getRowModel().rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="group/issue-row"
                          data-state={
                            row.getIsSelected() ? "selected" : undefined
                          }
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={columns.length}>
                          <Empty>
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <CircleDotIcon aria-hidden="true" />
                              </EmptyMedia>
                              <EmptyTitle>No matching issues</EmptyTitle>
                              <EmptyDescription>
                                Adjust the search or create the first issue for
                                this organization.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </IssueMutationContext.Provider>
            </div>
          )}
        </div>

        {!error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">{total} issues</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={showPreviousPage}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {table.getState().pagination.pageIndex + 1} /{" "}
                {Math.max(table.getPageCount(), 1)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanNextPage()}
                onClick={showNextPage}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={deleteTarget !== undefined}
        onOpenChange={handleDeleteOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this issue?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” will be permanently removed from this
              organization. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              <Trash2Icon data-icon="inline-start" aria-hidden="true" />
              Delete issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
