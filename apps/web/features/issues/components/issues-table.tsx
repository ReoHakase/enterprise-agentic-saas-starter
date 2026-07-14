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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
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
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table"
import {
  CircleDotIcon,
  ListFilterIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useMemo, useState, type ChangeEvent } from "react"

import { CreateIssueDialog } from "./create-issue-dialog"
import { getColumnResponsiveClass } from "./issue-inline-controls"
import { IssueMetrics } from "./issue-metrics"
import { useIssueColumns } from "./issue-table-columns"
import { safelyRunAction, statusOptions } from "./issue-utils"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueStatus,
  IssueUiItem,
  IssueUpdate,
} from "./types"

export const IssuesTable = ({
  issues,
  pending,
  busyIssueId,
  error,
  assignees,
  onCreate,
  onToggle,
  onDelete,
  onUpdate,
  onSelect,
  onRetry,
}: {
  issues: IssueUiItem[]
  pending?: boolean
  busyIssueId?: string
  error?: string
  assignees: IssueAssigneeOption[]
  onCreate: AsyncAction<[title: string]>
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onDelete: AsyncAction<[issue: IssueUiItem]>
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  onSelect: (issue: IssueUiItem) => void
  onRetry?: () => void
}) => {
  const [globalFilter, setGlobalFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | IssueStatus>("all")
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ])
  const [deleteTarget, setDeleteTarget] = useState<IssueUiItem>()
  const requestDelete = useCallback(
    (issue: IssueUiItem) => setDeleteTarget(issue),
    []
  )
  const columns = useIssueColumns({
    assignees,
    busyIssueId,
    onToggle,
    onUpdate,
    onSelect,
    onRequestDelete: requestDelete,
  })
  const table = useReactTable({
    data: issues,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
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
      setStatusFilter(value)
      table
        .getColumn("status")
        ?.setFilterValue(value === "all" ? undefined : value)
    },
    [table]
  )
  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setGlobalFilter(event.target.value)
    },
    []
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

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Organization issues</CardTitle>
          <CardDescription>
            Track work with searchable, sortable, tenant-scoped issues.
          </CardDescription>
          <CardAction>
            <CreateIssueDialog pending={pending} onCreate={onCreate} />
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 pt-(--card-spacing)">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <InputGroup className="md:max-w-md">
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={globalFilter}
                onChange={handleSearchChange}
                placeholder="Search issues"
                aria-label="Search issues"
              />
            </InputGroup>
            <Select
              items={statusOptions}
              value={statusFilter}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-full md:w-44">
                <ListFilterIcon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {statusOptions.find((option) => option.value === statusFilter)
                    ?.label ?? "All issues"}
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
              <Table>
                <TableCaption className="sr-only">
                  Issues for the active organization
                </TableCaption>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={getColumnResponsiveClass(header.column.id)}
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
                        data-state={
                          row.getIsSelected() ? "selected" : undefined
                        }
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className={getColumnResponsiveClass(cell.column.id)}
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
            </div>
          )}
        </CardContent>

        {!error ? (
          <CardFooter className="justify-between gap-3 border-t">
            <p className="text-sm text-muted-foreground">
              {table.getFilteredRowModel().rows.length} issues
            </p>
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
          </CardFooter>
        ) : null}
      </Card>

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
