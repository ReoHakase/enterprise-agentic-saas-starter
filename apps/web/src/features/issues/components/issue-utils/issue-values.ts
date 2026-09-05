import {
  getConsoleApiErrorText,
  getConsoleApiFieldError,
} from "@/features/console"
import { reportObservedError } from "@/lib/report-observed-error"

import type {
  IssueAssigneeOption,
  IssuePriority,
  IssueStatus,
  IssueUiItem,
} from "../types"

export const statusOptions = [
  { label: "All issues", value: "all" },
  { label: "Open", value: "open" },
  { label: "In progress", value: "in_progress" },
  { label: "Closed", value: "closed" },
]

export const issueStatusOptions: Array<{
  label: string
  value: IssueStatus
}> = [
  { label: "Open", value: "open" },
  { label: "In progress", value: "in_progress" },
  { label: "Closed", value: "closed" },
]

export const priorityOptions: Array<{
  label: string
  value: IssuePriority
}> = [
  { label: "No priority", value: "no_priority" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
]

export const priorityFilterOptions = [
  { label: "All priorities", value: "all" },
  ...priorityOptions,
]

export const emptyAssigneeOptions: IssueAssigneeOption[] = []

export const isIssueStatus = (value: string | null): value is IssueStatus =>
  value === "open" || value === "in_progress" || value === "closed"

export const isIssuePriority = (value: string | null): value is IssuePriority =>
  value === "no_priority" ||
  value === "low" ||
  value === "medium" ||
  value === "high" ||
  value === "urgent"

export const getIssueStatus = (issue: IssueUiItem): IssueStatus => issue.status

export const issueNumber = (issue: IssueUiItem) => `#${issue.number}`

export const getActionErrorMessage = (error: unknown, fallback: string) =>
  getConsoleApiErrorText(error, fallback)

export const getActionFieldError = (error: unknown, field: string) =>
  getConsoleApiFieldError(error, field)

export const safelyRunAction = (action: void | Promise<void>) => {
  if (action instanceof Promise) {
    void action.catch((error: unknown) => reportObservedError(error))
  }
}
