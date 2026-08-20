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
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
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
import Link from "next/link"
import { useCallback } from "react"

import {
  IssueAssigneeControl,
  IssueDueDateTimeControl,
  IssuePriorityControl,
  IssueStatusControl,
} from "../issue-metadata-controls/issue-metadata-controls"
import { useIssueMutationState } from "../issue-table-state/issue-table-state"
import { getIssueStatus, safelyRunAction } from "../issue-utils/issue-utils"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "../types"

const issueActionsTrigger = <Button variant="ghost" size="icon-sm" />

export const SortableIssueHeader = ({
  column,
  label,
  accessibleLabel,
  showDescendingIcon,
}: {
  column: Column<IssueUiItem, unknown>
  label: string
  accessibleLabel?: string
  showDescendingIcon?: boolean
}) => {
  const handleSort = useCallback(
    () => column.toggleSorting(column.getIsSorted() === "asc"),
    [column]
  )

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={accessibleLabel}
      onClick={handleSort}
    >
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
  href,
}: {
  issue: IssueUiItem
  href: string
}) => (
  <div className="flex max-w-xl min-w-72 flex-col items-start gap-1">
    <Link
      href={href}
      className="h-auto min-w-0 text-left text-sm font-medium whitespace-normal text-primary underline-offset-4 hover:underline"
    >
      {issue.title}
    </Link>
    {issue.labels.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {issue.labels.slice(0, 3).map((label) => (
          <Badge key={label} variant="outline">
            {label}
          </Badge>
        ))}
      </div>
    ) : null}
  </div>
)

export const IssueActionsCell = ({
  issue,
  selected,
  onSelect,
  onToggle,
  onRequestDelete,
  disabled = false,
}: {
  issue: IssueUiItem
  selected: boolean
  onSelect: (issue: IssueUiItem) => void
  onToggle: AsyncAction<[issue: IssueUiItem]>
  onRequestDelete: (issue: IssueUiItem) => void
  disabled?: boolean
}) => {
  const busy = useIssueMutationState(issue.id) || disabled
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
      <span className="flex w-full items-center justify-center">
        <span
          data-slot="issue-actions-island"
          className={cn(
            "inline-flex rounded-[calc(var(--radius-md)+0.25rem)] p-1 backdrop-blur-sm",
            selected
              ? "bg-[color-mix(in_oklab,var(--primary)_10%,var(--background))]/90"
              : "bg-background/90"
          )}
        >
          <DropdownMenuTrigger
            render={issueActionsTrigger}
            className="rounded-md bg-transparent p-2 ring-1 ring-border"
            aria-label={`Actions for ${issue.title}`}
            aria-busy={busy}
            disabled={busy}
          >
            {busy ? <Spinner /> : <EllipsisIcon aria-hidden="true" />}
          </DropdownMenuTrigger>
        </span>
      </span>
      <DropdownMenuContent
        align="end"
        className="w-44"
        aria-label={`Actions for ${issue.title}`}
      >
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
  disabled = false,
}: {
  issue: IssueUiItem
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  disabled?: boolean
}) => {
  const busy = useIssueMutationState(issue.id)
  const handleValueChange = useCallback(
    (value: IssueUiItem["status"] | "all") => {
      if (value !== "all") safelyRunAction(onUpdate?.(issue, { status: value }))
    },
    [issue, onUpdate]
  )

  return (
    <IssueStatusControl
      value={issue.status}
      className="w-32"
      disabled={!onUpdate || disabled}
      busy={busy}
      ariaLabel={`Status for ${issue.title}`}
      onValueChange={handleValueChange}
    />
  )
}

export const IssuePrioritySelect = ({
  issue,
  onUpdate,
  disabled = false,
}: {
  issue: IssueUiItem
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  disabled?: boolean
}) => {
  const busy = useIssueMutationState(issue.id)
  const handleValueChange = useCallback(
    (value: IssueUiItem["priority"] | "all") => {
      if (value !== "all")
        safelyRunAction(onUpdate?.(issue, { priority: value }))
    },
    [issue, onUpdate]
  )

  return (
    <IssuePriorityControl
      value={issue.priority}
      className="w-36"
      disabled={!onUpdate || disabled}
      busy={busy}
      ariaLabel={`Priority for ${issue.title}`}
      onValueChange={handleValueChange}
    />
  )
}

export const IssueAssigneeSelect = ({
  issue,
  assignees,
  onUpdate,
  disabled = false,
}: {
  issue: IssueUiItem
  assignees: IssueAssigneeOption[]
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  disabled?: boolean
}) => {
  const busy = useIssueMutationState(issue.id)
  const handleValueChange = useCallback(
    (assigneeId: string | null) =>
      safelyRunAction(onUpdate?.(issue, { assigneeId })),
    [issue, onUpdate]
  )

  return (
    <IssueAssigneeControl
      value={issue.assigneeId}
      assignees={assignees}
      className="w-48"
      disabled={!onUpdate || disabled}
      busy={busy}
      ariaLabel={`Assignee for ${issue.title}`}
      onValueChange={handleValueChange}
    />
  )
}

export const IssueDueDateInput = ({
  issue,
  onUpdate,
  disabled = false,
}: {
  issue: IssueUiItem
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
  disabled?: boolean
}) => {
  const busy = useIssueMutationState(issue.id)
  const handleValueChange = useCallback(
    (dueDate: string | null) => safelyRunAction(onUpdate?.(issue, { dueDate })),
    [issue, onUpdate]
  )

  return (
    <IssueDueDateTimeControl
      value={issue.dueDate}
      className="w-48"
      disabled={!onUpdate || disabled}
      busy={busy}
      ariaLabel={`Due date and time for ${issue.title}`}
      onValueChange={handleValueChange}
    />
  )
}
