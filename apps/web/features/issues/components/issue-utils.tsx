import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  CheckCircle2Icon,
  CircleDotIcon,
  Clock3Icon,
  FlagIcon,
} from "lucide-react"

import { ConsoleApiError } from "@/lib/console-api"

import type {
  IssueAssigneeOption,
  IssueCommentUiItem,
  IssuePriority,
  IssueStatus,
  IssueUiItem,
} from "./types"

export const statusOptions = [
  { label: "All issues", value: "all" },
  { label: "Open", value: "open" },
  { label: "In progress", value: "in_progress" },
  { label: "Closed", value: "closed" },
]

export const issueStatusOptions = statusOptions.slice(1)

export const priorityOptions = [
  { label: "No priority", value: "no_priority" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
]

export const emptyAssigneeOptions: IssueAssigneeOption[] = []
export const emptyIssueComments: IssueCommentUiItem[] = []

export const isIssueStatus = (value: string | null): value is IssueStatus =>
  value === "open" || value === "in_progress" || value === "closed"

export const isIssuePriority = (value: string | null): value is IssuePriority =>
  value === "no_priority" ||
  value === "low" ||
  value === "medium" ||
  value === "high" ||
  value === "urgent"

export const getIssueStatus = (issue: IssueUiItem): IssueStatus => issue.status

export const formatIssueDate = (value?: string) => {
  if (!value) {
    return "Not recorded"
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value))
}

export const issueNumber = (issue: IssueUiItem) => `#${issue.number}`

export const getActionErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message && error.message !== "[object Object]"
    ? error.message
    : fallback

export const getActionFieldError = (error: unknown, field: string) =>
  error instanceof ConsoleApiError ? error.fieldErrors[field]?.[0] : undefined

export const safelyRunAction = (action: void | Promise<void>) => {
  if (action instanceof Promise) {
    void action.catch(() => undefined)
  }
}

export const StatusBadge = ({ status }: { status: IssueStatus }) => {
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

export const PriorityBadge = ({ priority }: { priority: IssuePriority }) => {
  const label = priority === "no_priority" ? "No priority" : priority

  return (
    <Badge variant="outline">
      <FlagIcon aria-hidden="true" />
      <span className="capitalize">{label}</span>
    </Badge>
  )
}
