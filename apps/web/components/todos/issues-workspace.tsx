"use client"

/* oxlint-disable eslint-plugin-react-perf(jsx-no-new-function-as-prop) */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
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
import { Checkbox } from "@enterprise-agentic-saas/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@enterprise-agentic-saas/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
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
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  Clock3Icon,
  EllipsisIcon,
  FlagIcon,
  ListFilterIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"

import { getSafeAvatarUrl } from "@/lib/avatar-url"

export type IssueStatus = "open" | "in_progress" | "closed"
export type IssuePriority = "no_priority" | "low" | "medium" | "high" | "urgent"

export type IssueUiItem = {
  id: string
  number: number
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  assigneeId: string | null
  creatorId: string
  labels: string[]
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

export type IssueCommentUiItem = {
  id: string
  authorId: string
  author: {
    id: string
    name: string
    image: string | null
  }
  body: string
  createdAt: string
  updatedAt: string
}

export type IssueUpdate = Partial<
  Pick<
    IssueUiItem,
    | "title"
    | "description"
    | "status"
    | "priority"
    | "assigneeId"
    | "labels"
    | "dueDate"
  >
>

export type IssueAssigneeOption = {
  id: string
  name: string
  email: string
}

export type IssuesWorkspaceProps = {
  issues: IssueUiItem[]
  pending?: boolean
  busyIssueId?: string
  error?: string
  onCreate: (title: string) => void
  onToggle: (issue: IssueUiItem) => void
  onDelete: (issue: IssueUiItem) => void
  onUpdate?: (issue: IssueUiItem, update: IssueUpdate) => void
  assignees?: IssueAssigneeOption[]
  onSelectIssue?: (issue?: IssueUiItem) => void
  comments?: IssueCommentUiItem[]
  commentsPending?: boolean
  commentsError?: string
  onCreateComment?: (issue: IssueUiItem, body: string) => void
  onUpdateComment?: (
    issue: IssueUiItem,
    commentId: string,
    body: string
  ) => void
  onDeleteComment?: (issue: IssueUiItem, commentId: string) => void
  onRetry?: () => void
}

const statusOptions = [
  { label: "All issues", value: "all" },
  { label: "Open", value: "open" },
  { label: "In progress", value: "in_progress" },
  { label: "Closed", value: "closed" },
]

const issueStatusOptions = statusOptions.slice(1)

const priorityOptions = [
  { label: "No priority", value: "no_priority" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
]

const isIssueStatus = (value: string | null): value is IssueStatus =>
  value === "open" || value === "in_progress" || value === "closed"

const isIssuePriority = (value: string | null): value is IssuePriority =>
  value === "no_priority" ||
  value === "low" ||
  value === "medium" ||
  value === "high" ||
  value === "urgent"

const getIssueStatus = (issue: IssueUiItem): IssueStatus => issue.status

const formatIssueDate = (value?: string) => {
  if (!value) {
    return "Not recorded"
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value))
}

const issueNumber = (issue: IssueUiItem) => `#${issue.number}`

export const IssuesWorkspace = ({
  issues,
  pending,
  busyIssueId,
  error,
  onCreate,
  onToggle,
  onDelete,
  onUpdate,
  assignees,
  onSelectIssue,
  comments,
  commentsPending,
  commentsError,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
  onRetry,
}: IssuesWorkspaceProps) => {
  const [globalFilter, setGlobalFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | IssueStatus>("all")
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [newIssueOpen, setNewIssueOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [selectedIssueId, setSelectedIssueId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<IssueUiItem>()
  const selectedIssue = issues.find((issue) => issue.id === selectedIssueId)

  const selectIssue = useCallback(
    (issue?: IssueUiItem) => {
      setSelectedIssueId(issue?.id)
      onSelectIssue?.(issue)
    },
    [onSelectIssue]
  )

  const columns = useMemo<ColumnDef<IssueUiItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(Boolean(checked))
            }
            aria-label="Select all issues on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
            aria-label={`Select ${row.original.title}`}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "status",
        accessorFn: getIssueStatus,
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge status={getIssueStatus(row.original)} />
        ),
        filterFn: "equalsString",
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Issue
            <ArrowUpDownIcon data-icon="inline-end" aria-hidden="true" />
          </Button>
        ),
        cell: ({ row }) => {
          const issue = row.original
          return (
            <div className="flex max-w-xl min-w-64 flex-col items-start gap-1">
              <Button
                variant="link"
                className="h-auto min-w-0 justify-start p-0 text-left whitespace-normal"
                onClick={() => selectIssue(issue)}
              >
                {issue.title}
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{issueNumber(issue)}</span>
                <span>Updated {formatIssueDate(issue.updatedAt)}</span>
                {issue.labels.slice(0, 3).map((label) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          )
        },
      },
      {
        id: "priority",
        accessorFn: (issue) => issue.priority,
        header: "Priority",
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: "updatedAt",
        accessorFn: (issue) => issue.updatedAt,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Updated
            {column.getIsSorted() === "desc" ? (
              <ArrowDownIcon data-icon="inline-end" aria-hidden="true" />
            ) : (
              <ArrowUpDownIcon data-icon="inline-end" aria-hidden="true" />
            )}
          </Button>
        ),
        cell: ({ row }) => formatIssueDate(row.original.updatedAt),
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const issue = row.original
          const closed = getIssueStatus(issue) === "closed"
          const busy = busyIssueId === issue.id

          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" />}
                disabled={busy}
                aria-label={`Actions for ${issue.title}`}
              >
                {busy ? <Spinner /> : <EllipsisIcon aria-hidden="true" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Issue actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => selectIssue(issue)}>
                    <CircleDotIcon aria-hidden="true" />
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggle(issue)}>
                    {closed ? (
                      <CircleIcon aria-hidden="true" />
                    ) : (
                      <CheckCircle2Icon aria-hidden="true" />
                    )}
                    {closed ? "Reopen issue" : "Close issue"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteTarget(issue)}
                  >
                    <Trash2Icon aria-hidden="true" />
                    Delete issue
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [busyIssueId, onToggle, selectIssue]
  )

  const table = useReactTable({
    data: issues,
    columns,
    state: { globalFilter, sorting, rowSelection },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    initialState: { pagination: { pageSize: 10 } },
  })

  const openCount = issues.filter(
    (issue) => getIssueStatus(issue) !== "closed"
  ).length
  const inProgressCount = issues.filter(
    (issue) => getIssueStatus(issue) === "in_progress"
  ).length
  const closedCount = issues.length - openCount

  const handleStatusChange = (value: string | null) => {
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
  }

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setGlobalFilter(event.target.value)
  }

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle) {
      return
    }
    onCreate(nextTitle)
    setTitle("")
    setNewIssueOpen(false)
  }

  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Issues">
      <div className="grid gap-4 sm:grid-cols-3">
        <IssueMetricCard label="Open" value={openCount} icon={CircleDotIcon} />
        <IssueMetricCard
          label="In progress"
          value={inProgressCount}
          icon={Clock3Icon}
        />
        <IssueMetricCard
          label="Closed"
          value={closedCount}
          icon={CheckCircle2Icon}
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Organization issues</CardTitle>
          <CardDescription>
            Track work with searchable, sortable, tenant-scoped issues.
          </CardDescription>
          <CardAction>
            <Dialog open={newIssueOpen} onOpenChange={setNewIssueOpen}>
              <DialogTrigger render={<Button />}>
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                New issue
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Create issue</DialogTitle>
                    <DialogDescription>
                      Start with a clear outcome. You can add more context from
                      the issue detail view.
                    </DialogDescription>
                  </DialogHeader>
                  <FieldGroup className="py-5">
                    <Field>
                      <FieldLabel htmlFor="issue-title">Title</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id="issue-title"
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                          placeholder="What needs to be done?"
                          autoComplete="off"
                          required
                        />
                      </InputGroup>
                      <FieldDescription>
                        Use a short, actionable sentence.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setNewIssueOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={pending || title.trim().length === 0}
                    >
                      {pending ? <Spinner data-icon="inline-start" /> : null}
                      Create issue
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
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
            </div>
          )}
        </CardContent>

        {!error ? (
          <CardFooter className="justify-between gap-3 border-t">
            <p className="text-sm text-muted-foreground">
              {table.getFilteredSelectedRowModel().rows.length} selected ·{" "}
              {table.getFilteredRowModel().rows.length} issues
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
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
                onClick={() => table.nextPage()}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        ) : null}
      </Card>

      <IssueDetailDialog
        issue={selectedIssue}
        comments={comments}
        assignees={assignees}
        commentsPending={commentsPending}
        commentsError={commentsError}
        pending={pending || busyIssueId === selectedIssue?.id}
        onUpdate={onUpdate}
        onCreateComment={onCreateComment}
        onUpdateComment={onUpdateComment}
        onDeleteComment={onDeleteComment}
        onOpenChange={(open) => {
          if (!open) {
            selectIssue()
          }
        }}
      />

      <AlertDialog
        open={deleteTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(undefined)
          }
        }}
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
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  onDelete(deleteTarget)
                  setDeleteTarget(undefined)
                }
              }}
            >
              <Trash2Icon data-icon="inline-start" aria-hidden="true" />
              Delete issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

const IssueMetricCard = ({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof CircleDotIcon
}) => (
  <Card size="sm">
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      <CardAction>
        <Icon aria-hidden="true" />
      </CardAction>
    </CardHeader>
  </Card>
)

const StatusBadge = ({ status }: { status: IssueStatus }) => {
  if (status === "closed") {
    return (
      <Badge variant="secondary">
        <CheckCircle2Icon aria-hidden="true" />
        Closed
      </Badge>
    )
  }

  if (status === "in_progress") {
    return (
      <Badge variant="outline">
        <Clock3Icon aria-hidden="true" />
        In progress
      </Badge>
    )
  }

  return (
    <Badge variant="outline">
      <CircleDotIcon aria-hidden="true" />
      Open
    </Badge>
  )
}

const PriorityBadge = ({ priority }: { priority: IssuePriority }) => {
  const label = priority === "no_priority" ? "No priority" : priority

  return (
    <Badge variant="outline">
      <FlagIcon aria-hidden="true" />
      <span className="capitalize">{label}</span>
    </Badge>
  )
}

const IssueDetailDialog = ({
  issue,
  assignees = [],
  comments = [],
  commentsPending,
  commentsError,
  pending,
  onUpdate,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
  onOpenChange,
}: {
  issue?: IssueUiItem
  assignees?: IssueAssigneeOption[]
  comments?: IssueCommentUiItem[]
  commentsPending?: boolean
  commentsError?: string
  pending?: boolean
  onUpdate?: (issue: IssueUiItem, update: IssueUpdate) => void
  onCreateComment?: (issue: IssueUiItem, body: string) => void
  onUpdateComment?: (
    issue: IssueUiItem,
    commentId: string,
    body: string
  ) => void
  onDeleteComment?: (issue: IssueUiItem, commentId: string) => void
  onOpenChange: (open: boolean) => void
}) => {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<IssueStatus>("open")
  const [priority, setPriority] = useState<IssuePriority>("no_priority")
  const [assigneeId, setAssigneeId] = useState("unassigned")
  const [labels, setLabels] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [commentBody, setCommentBody] = useState("")
  const assigneeItems = useMemo(
    () => [
      { label: "Unassigned", value: "unassigned" },
      ...assignees.map((assignee) => ({
        label: assignee.name,
        value: assignee.id,
      })),
    ],
    [assignees]
  )

  useEffect(() => {
    if (!issue) {
      return
    }

    setTitle(issue.title)
    setDescription(issue.description)
    setStatus(issue.status)
    setPriority(issue.priority)
    setAssigneeId(issue.assigneeId ?? "unassigned")
    setLabels(issue.labels.join(", "))
    setDueDate(issue.dueDate?.slice(0, 10) ?? "")
    setCommentBody("")
  }, [issue])

  const saveIssue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!issue || !onUpdate || title.trim().length === 0) {
      return
    }

    onUpdate(issue, {
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      assigneeId: assigneeId === "unassigned" ? null : assigneeId,
      labels: [
        ...new Set(labels.split(",").map((label) => label.trim())),
      ].filter(Boolean),
      dueDate: dueDate
        ? new Date(`${dueDate}T00:00:00.000Z`).toISOString()
        : null,
    })
  }

  const createComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = commentBody.trim()
    if (!issue || !onCreateComment || body.length === 0) {
      return
    }

    onCreateComment(issue, body)
    setCommentBody("")
  }

  return (
    <Dialog open={issue !== undefined} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            {issue ? <StatusBadge status={getIssueStatus(issue)} /> : null}
            <span className="text-sm text-muted-foreground">
              {issue ? issueNumber(issue) : null}
            </span>
          </div>
          <DialogTitle className="text-xl leading-tight">
            {issue?.title}
          </DialogTitle>
          <DialogDescription>
            Created {formatIssueDate(issue?.createdAt)} · Updated{" "}
            {formatIssueDate(issue?.updatedAt)}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5" onSubmit={saveIssue}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="issue-detail-title">Title</FieldLabel>
              <Input
                id="issue-detail-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="issue-detail-description">
                Description
              </FieldLabel>
              <Textarea
                id="issue-detail-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add context, acceptance criteria, or links."
                className="min-h-28"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select
                  items={issueStatusOptions}
                  value={status}
                  onValueChange={(value) => {
                    if (isIssueStatus(value)) {
                      setStatus(value)
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <span className="min-w-0 flex-1 truncate text-left">
                      {issueStatusOptions.find(
                        (option) => option.value === status
                      )?.label ?? "Open"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {issueStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <Select
                  items={priorityOptions}
                  value={priority}
                  onValueChange={(value) => {
                    if (isIssuePriority(value)) {
                      setPriority(value)
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <span className="min-w-0 flex-1 truncate text-left">
                      {priorityOptions.find(
                        (option) => option.value === priority
                      )?.label ?? "No priority"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {priorityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Assignee</FieldLabel>
                <Select
                  items={assigneeItems}
                  value={assigneeId}
                  onValueChange={(value) =>
                    setAssigneeId(value ?? "unassigned")
                  }
                >
                  <SelectTrigger className="w-full">
                    <span className="min-w-0 flex-1 truncate text-left">
                      {assignees.find((assignee) => assignee.id === assigneeId)
                        ?.name ?? "Unassigned"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assignees.map((assignee) => (
                        <SelectItem key={assignee.id} value={assignee.id}>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{assignee.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {assignee.email}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="issue-detail-labels">Labels</FieldLabel>
                <Input
                  id="issue-detail-labels"
                  value={labels}
                  onChange={(event) => setLabels(event.target.value)}
                  placeholder="billing, bug, customer"
                />
                <FieldDescription>
                  Separate labels with commas.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="issue-detail-due-date">
                  Due date
                </FieldLabel>
                <Input
                  id="issue-detail-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="submit"
              disabled={pending || !onUpdate || title.trim().length === 0}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>

        <div className="flex flex-col gap-4 border-t pt-5">
          <div>
            <h3 className="font-medium">Discussion</h3>
            <p className="text-sm text-muted-foreground">
              Keep decisions and progress attached to the issue.
            </p>
          </div>
          {commentsPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading comments
            </div>
          ) : commentsError ? (
            <p role="alert" className="text-sm text-destructive">
              {commentsError}
            </p>
          ) : comments.length > 0 ? (
            <div className="flex flex-col gap-3">
              {comments.map((comment) => (
                <IssueComment
                  key={comment.id}
                  comment={comment}
                  pending={pending}
                  onUpdate={
                    issue && onUpdateComment
                      ? (body) => onUpdateComment(issue, comment.id, body)
                      : undefined
                  }
                  onDelete={
                    issue && onDeleteComment
                      ? () => onDeleteComment(issue, comment.id)
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No comments yet. Add the first update below.
            </p>
          )}
          <form className="flex flex-col gap-3" onSubmit={createComment}>
            <Field>
              <FieldLabel htmlFor="issue-comment-body">Add comment</FieldLabel>
              <Textarea
                id="issue-comment-body"
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="Share an update or decision."
                className="min-h-24"
              />
            </Field>
            <Button
              className="self-end"
              type="submit"
              disabled={
                pending || !onCreateComment || commentBody.trim().length === 0
              }
            >
              Comment
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const IssueComment = ({
  comment,
  pending,
  onUpdate,
  onDelete,
}: {
  comment: IssueCommentUiItem
  pending?: boolean
  onUpdate?: (body: string) => void
  onDelete?: () => void
}) => {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)

  useEffect(() => setBody(comment.body), [comment.body])

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8">
            <AvatarImage
              src={getSafeAvatarUrl(comment.author.image)}
              alt={comment.author.name}
            />
            <AvatarFallback>
              {comment.author.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {comment.author.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatIssueDate(comment.updatedAt)}
            </p>
          </div>
        </div>
        {onUpdate || onDelete ? (
          <div className="flex items-center gap-1">
            {onUpdate ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? "Cancel" : "Edit"}
              </Button>
            ) : null}
            {onDelete ? (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="ghost" size="sm" disabled={pending} />
                  }
                >
                  Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This comment will be permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onDelete}>
                      Delete comment
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        ) : null}
      </div>
      {editing && onUpdate ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const nextBody = body.trim()
            if (!nextBody) {
              return
            }
            onUpdate(nextBody)
            setEditing(false)
          }}
        >
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label="Edit comment"
          />
          <Button
            type="submit"
            size="sm"
            className="self-end"
            disabled={pending || body.trim().length === 0}
          >
            Save comment
          </Button>
        </form>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
      )}
    </div>
  )
}
