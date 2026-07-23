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
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { usePathname } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react"

import { LinkButton } from "@/components/link-button"
import {
  serializeIssueSearchParams,
  type IssueSearchState,
  type SetIssueSearchState,
} from "@/features/issues/search-params"
import { useIsHydrated } from "@/hooks/use-is-hydrated"

import { CreateIssueDialog } from "./create-issue-dialog"
import {
  IssueAssigneeControl,
  IssuePriorityControl,
  IssueStatusControl,
} from "./issue-metadata-controls"
import { IssueMetrics } from "./issue-metrics"
import { useIssueColumns } from "./issue-table-columns"
import { IssueMutationContext } from "./issue-table-state"
import { safelyRunAction } from "./issue-utils"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "./types"

const getIssueRowId = (issue: IssueUiItem) => issue.id
const issueColumnClassName = (columnId: string) => {
  if (columnId === "number") return "w-14 max-w-14 px-2"
  if (columnId === "thumbnail") return "w-20 min-w-20 px-2"
  if (columnId === "comments" || columnId === "files") {
    return "w-20 min-w-20 text-center"
  }
  if (columnId === "actions") return "w-12"
  return undefined
}
const ISSUE_FILTER_DEBOUNCE_MS = 300
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
  const pathname = usePathname()
  const isHydrated = useIsHydrated()
  const [deleteTarget, setDeleteTarget] = useState<IssueUiItem>()
  const [searchDraft, setSearchDraft] = useState(searchState.q)
  const [labelDraft, setLabelDraft] = useState(searchState.label)
  const requestDelete = useCallback(
    (issue: IssueUiItem) => setDeleteTarget(issue),
    []
  )
  const columns = useIssueColumns({
    organizationId,
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
      void onViewChange({
        priority: value,
        page: 1,
      })
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
  const previousPageHref = serializeIssueSearchParams(pathname, {
    ...searchState,
    page: Math.max(searchState.page - 1, 1),
  })
  const nextPageHref = serializeIssueSearchParams(pathname, {
    ...searchState,
    page: searchState.page + 1,
  })
  const showPreviousPage = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        !isHydrated ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      event.preventDefault()
      table.previousPage()
    },
    [isHydrated, table]
  )
  const showNextPage = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        !isHydrated ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      event.preventDefault()
      table.nextPage()
    },
    [isHydrated, table]
  )
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
                value={searchDraft}
                onChange={handleSearchChange}
                placeholder="Search issues"
                aria-label="Search issues"
              />
            </InputGroup>
            <IssueStatusControl
              value={searchState.status}
              includeAll
              className="w-full md:w-44"
              ariaLabel="Filter issues by status"
              onValueChange={handleStatusChange}
            />
            <IssuePriorityControl
              value={searchState.priority}
              includeAll
              className="w-full md:w-44"
              ariaLabel="Filter issues by priority"
              onValueChange={handlePriorityChange}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InputGroup>
              <InputGroupInput
                value={labelDraft}
                onChange={handleLabelChange}
                placeholder="Filter by label"
                aria-label="Filter issues by label"
              />
            </InputGroup>
            <IssueAssigneeControl
              value={searchState.assignee || null}
              assignees={assignees}
              includeAll
              className="w-full"
              ariaLabel="Filter issues by assignee"
              onValueChange={handleAssigneeChange}
            />
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
                          <TableHead
                            key={header.id}
                            className={issueColumnClassName(header.column.id)}
                          >
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
                            <TableCell
                              key={cell.id}
                              className={issueColumnClassName(cell.column.id)}
                            >
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
              {table.getCanPreviousPage() ? (
                <LinkButton
                  variant="outline"
                  size="sm"
                  href={previousPageHref}
                  prefetch={false}
                  onClick={showPreviousPage}
                >
                  Previous
                </LinkButton>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                {table.getState().pagination.pageIndex + 1} /{" "}
                {Math.max(table.getPageCount(), 1)}
              </span>
              {table.getCanNextPage() ? (
                <LinkButton
                  variant="outline"
                  size="sm"
                  href={nextPageHref}
                  prefetch={false}
                  onClick={showNextPage}
                >
                  Next
                </LinkButton>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              )}
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
