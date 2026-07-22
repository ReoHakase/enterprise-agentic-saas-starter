"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  Button,
  buttonVariants,
} from "@enterprise-agentic-saas/ui/components/button"
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
  Maximize2Icon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useCallback } from "react"

import {
  IssueAssigneeControl,
  IssueDueDateTimeControl,
  IssuePriorityControl,
  IssueStatusControl,
} from "./issue-metadata-controls"
import { useIssueMutationState } from "./issue-table-state"
import { getIssueStatus, safelyRunAction } from "./issue-utils"
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
  href,
}: {
  issue: IssueUiItem
  href: string
}) => (
  <div className="flex max-w-xl min-w-72 items-start justify-between gap-3">
    <div className="flex min-w-0 flex-col items-start gap-1">
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
    <a
      href={href}
      className={cn(
        buttonVariants({ variant: "outline", size: "xs" }),
        "opacity-100 transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-focus-within/issue-row:pointer-events-auto sm:group-focus-within/issue-row:opacity-100 sm:group-hover/issue-row:pointer-events-auto sm:group-hover/issue-row:opacity-100"
      )}
      aria-label={`Open ${issue.title} as full page`}
    >
      <Maximize2Icon data-icon="inline-start" aria-hidden="true" />
      Full page
    </a>
  </div>
)

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
    (value: IssueUiItem["status"] | "all") => {
      if (value !== "all") safelyRunAction(onUpdate?.(issue, { status: value }))
    },
    [issue, onUpdate]
  )

  return (
    <IssueStatusControl
      value={issue.status}
      className="w-32"
      disabled={!onUpdate}
      busy={busy}
      ariaLabel={`Status for ${issue.title}`}
      onValueChange={handleValueChange}
    />
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
      disabled={!onUpdate}
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
}: {
  issue: IssueUiItem
  assignees: IssueAssigneeOption[]
  onUpdate?: AsyncAction<[issue: IssueUiItem, update: IssueUpdate]>
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
      disabled={!onUpdate}
      busy={busy}
      ariaLabel={`Assignee for ${issue.title}`}
      onValueChange={handleValueChange}
    />
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
  const handleValueChange = useCallback(
    (dueDate: string | null) => safelyRunAction(onUpdate?.(issue, { dueDate })),
    [issue, onUpdate]
  )

  return (
    <IssueDueDateTimeControl
      value={issue.dueDate}
      className="w-48"
      disabled={!onUpdate}
      busy={busy}
      ariaLabel={`Due date and time for ${issue.title}`}
      onValueChange={handleValueChange}
    />
  )
}
