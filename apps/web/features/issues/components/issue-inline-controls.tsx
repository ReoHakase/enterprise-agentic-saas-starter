"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import type { Column } from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  EllipsisIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useMemo, type ChangeEvent } from "react"

import { UserAvatar } from "@/components/user-identity"
import { parseDueDateInput } from "@/features/issues/schema"

import {
  formatIssueDate,
  getIssueStatus,
  isIssuePriority,
  isIssueStatus,
  issueNumber,
  issueStatusOptions,
  PriorityBadge,
  priorityOptions,
  safelyRunAction,
  StatusBadge,
} from "./issue-utils"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "./types"

const issueActionsTrigger = <Button variant="ghost" size="icon-sm" />

export const SortableIssueHeader = ({
  column,
  label,
  showDescendingIcon,
}: {
  column: Column<IssueUiItem, unknown>
  label: string
  showDescendingIcon?: boolean
}) => {
  const handleSort = useCallback(
    () => column.toggleSorting(column.getIsSorted() === "asc"),
    [column]
  )

  return (
    <Button variant="ghost" size="sm" onClick={handleSort}>
      {label}
      {showDescendingIcon && column.getIsSorted() === "desc" ? (
        <ArrowDownIcon data-icon="inline-end" aria-hidden="true" />
      ) : (
        <ArrowUpDownIcon data-icon="inline-end" aria-hidden="true" />
      )}
    </Button>
  )
}

export const IssueTitleCell = ({
  issue,
  onSelect,
}: {
  issue: IssueUiItem
  onSelect: (issue: IssueUiItem) => void
}) => {
  const handleSelect = useCallback(() => onSelect(issue), [issue, onSelect])

  return (
    <div className="flex max-w-xl min-w-64 flex-col items-start gap-1">
      <Button
        variant="link"
        className="h-auto min-w-0 justify-start p-0 text-left whitespace-normal"
        onClick={handleSelect}
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
}

export const IssueActionsCell = ({
  issue,
  busy,
  onSelect,
  onToggle,
  onRequestDelete,
}: {
  issue: IssueUiItem
  busy: boolean
  onSelect: (issue: IssueUiItem) => void
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onRequestDelete: (issue: IssueUiItem) => void
}) => {
  const closed = getIssueStatus(issue) === "closed"
  const handleSelect = useCallback(() => onSelect(issue), [issue, onSelect])
  const handleToggle = useCallback(
    () => safelyRunAction(onToggle(issue)),
    [issue, onToggle]
  )
  const handleRequestDelete = useCallback(
    () => onRequestDelete(issue),
    [issue, onRequestDelete]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={issueActionsTrigger}
        disabled={busy}
        aria-label={`Actions for ${issue.title}`}
      >
        {busy ? <Spinner /> : <EllipsisIcon aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Issue actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleSelect}>
            <CircleDotIcon aria-hidden="true" />
            View details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggle}>
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
          <DropdownMenuItem variant="destructive" onClick={handleRequestDelete}>
            <Trash2Icon aria-hidden="true" />
            Delete issue
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const getColumnResponsiveClass = (columnId: string) => {
  if (
    columnId === "assignee" ||
    columnId === "dueDate" ||
    columnId === "updatedAt"
  ) {
    return "hidden xl:table-cell"
  }

  if (columnId === "priority") {
    return "hidden md:table-cell"
  }

  return undefined
}

export const IssueStatusSelect = ({
  issue,
  disabled,
  onUpdate,
}: {
  issue: IssueUiItem
  disabled: boolean
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
}) => {
  const handleValueChange = useCallback(
    (value: string | null) => {
      if (isIssueStatus(value) && value !== issue.status) {
        safelyRunAction(onUpdate?.(issue, { status: value }))
      }
    },
    [issue, onUpdate]
  )

  return (
    <Select
      items={issueStatusOptions}
      value={issue.status}
      disabled={disabled}
      onValueChange={handleValueChange}
    >
      <SelectTrigger className="w-32" aria-label={`Status for ${issue.title}`}>
        <StatusBadge status={issue.status} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {issueStatusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export const IssuePrioritySelect = ({
  issue,
  disabled,
  onUpdate,
}: {
  issue: IssueUiItem
  disabled: boolean
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
}) => {
  const handleValueChange = useCallback(
    (value: string | null) => {
      if (isIssuePriority(value) && value !== issue.priority) {
        safelyRunAction(onUpdate?.(issue, { priority: value }))
      }
    },
    [issue, onUpdate]
  )

  return (
    <Select
      items={priorityOptions}
      value={issue.priority}
      disabled={disabled}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className="w-36"
        aria-label={`Priority for ${issue.title}`}
      >
        <PriorityBadge priority={issue.priority} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {priorityOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export const IssueAssigneeSelect = ({
  issue,
  assignees,
  disabled,
  onUpdate,
}: {
  issue: IssueUiItem
  assignees: IssueAssigneeOption[]
  disabled: boolean
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
}) => {
  const selected = assignees.find(
    (assignee) => assignee.id === issue.assigneeId
  )
  const items = useMemo(
    () => [
      { label: "Unassigned", value: "unassigned" },
      ...assignees.map((assignee) => ({
        label: assignee.name,
        value: assignee.id,
      })),
    ],
    [assignees]
  )
  const handleValueChange = useCallback(
    (value: string | null) => {
      const assigneeId = value === "unassigned" ? null : value
      if (assigneeId !== issue.assigneeId) {
        safelyRunAction(onUpdate?.(issue, { assigneeId }))
      }
    },
    [issue, onUpdate]
  )

  return (
    <Select
      items={items}
      value={issue.assigneeId ?? "unassigned"}
      disabled={disabled}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className="w-48"
        aria-label={`Assignee for ${issue.title}`}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar user={selected} className="size-6" />
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <span>Unassigned</span>
        )}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {assignees.map((assignee) => (
            <SelectItem key={assignee.id} value={assignee.id}>
              <span className="flex min-w-0 items-center gap-2">
                <UserAvatar user={assignee} className="size-6" />
                <span className="min-w-0">
                  <span className="block truncate">{assignee.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {assignee.email}
                  </span>
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export const IssueDueDateInput = ({
  issue,
  disabled,
  onUpdate,
}: {
  issue: IssueUiItem
  disabled: boolean
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const dueDate = event.target.value || null
      if (dueDate !== issue.dueDate) {
        safelyRunAction(onUpdate?.(issue, { dueDate }))
      }
    },
    [issue, onUpdate]
  )

  return (
    <Input
      key={issue.dueDate ?? "empty"}
      className="w-40"
      type="date"
      defaultValue={parseDueDateInput(issue.dueDate)}
      disabled={disabled}
      aria-label={`Due date for ${issue.title}`}
      onChange={handleChange}
    />
  )
}
