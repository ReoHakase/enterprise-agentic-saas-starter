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

import { useIssueMutationState } from "./issue-table-state"
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
  onSelect,
  onToggle,
  onRequestDelete,
}: {
  issue: IssueUiItem
  onSelect: (issue: IssueUiItem) => void
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onRequestDelete: (issue: IssueUiItem) => void
}) => {
  const busy = useIssueMutationState(issue.id)
  const closed = getIssueStatus(issue) === "closed"
  const handleSelect = useCallback(() => onSelect(issue), [issue, onSelect])
  const handleToggle = useCallback(() => {
    if (!busy) safelyRunAction(onToggle(issue))
  }, [busy, issue, onToggle])
  const handleRequestDelete = useCallback(() => {
    if (!busy) onRequestDelete(issue)
  }, [busy, issue, onRequestDelete])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={issueActionsTrigger}
        aria-label={`Actions for ${issue.title}`}
        aria-busy={busy}
      >
        {busy ? <Spinner /> : <EllipsisIcon aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Issue actions</DropdownMenuLabel>
          <DropdownMenuItem disabled={busy} onClick={handleSelect}>
            <CircleDotIcon aria-hidden="true" />
            View details
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onClick={handleToggle}>
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
            disabled={busy}
            onClick={handleRequestDelete}
          >
            <Trash2Icon aria-hidden="true" />
            Delete issue
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const IssueStatusSelect = ({
  issue,
  onUpdate,
}: {
  issue: IssueUiItem
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
}) => {
  const busy = useIssueMutationState(issue.id)
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
      disabled={!onUpdate}
      readOnly={busy}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className="w-32"
        aria-label={`Status for ${issue.title}`}
        aria-busy={busy}
      >
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
  onUpdate,
}: {
  issue: IssueUiItem
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
}) => {
  const busy = useIssueMutationState(issue.id)
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
      disabled={!onUpdate}
      readOnly={busy}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className="w-36"
        aria-label={`Priority for ${issue.title}`}
        aria-busy={busy}
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
  onUpdate,
}: {
  issue: IssueUiItem
  assignees: IssueAssigneeOption[]
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
}) => {
  const busy = useIssueMutationState(issue.id)
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
      disabled={!onUpdate}
      readOnly={busy}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className="w-48"
        aria-label={`Assignee for ${issue.title}`}
        aria-busy={busy}
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
  onUpdate,
}: {
  issue: IssueUiItem
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
}) => {
  const busy = useIssueMutationState(issue.id)
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
      disabled={!onUpdate}
      readOnly={busy}
      aria-label={`Due date for ${issue.title}`}
      aria-busy={busy}
      onChange={handleChange}
    />
  )
}
