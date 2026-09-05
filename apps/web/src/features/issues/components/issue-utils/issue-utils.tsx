import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  CheckCircle2Icon,
  CircleDotIcon,
  Clock3Icon,
  FlagIcon,
  ListFilterIcon,
} from "lucide-react"

import type { IssuePriority, IssueStatus } from "../types"
import { priorityOptions } from "./issue-values"

export const StatusBadge = ({ status }: { status: IssueStatus }) => {
  if (status === "closed") {
    return (
      <Badge
        data-testid="status-closed"
        className="border-purple-600 bg-purple-600 text-white dark:border-purple-500 dark:bg-purple-500 dark:text-white"
        variant="outline"
      >
        <CheckCircle2Icon aria-hidden="true" />
        Closed
      </Badge>
    )
  }

  if (status === "in_progress") {
    return (
      <Badge
        data-testid="status-in-progress"
        className="border-violet-300 bg-violet-200 text-violet-950 dark:border-violet-300 dark:bg-violet-300 dark:text-violet-950"
        variant="outline"
      >
        <Clock3Icon aria-hidden="true" />
        In progress
      </Badge>
    )
  }

  return (
    <Badge
      data-testid="status-open"
      className="border-zinc-300 bg-white text-zinc-950 dark:border-zinc-200 dark:bg-white dark:text-zinc-950"
      variant="outline"
    >
      <CircleDotIcon aria-hidden="true" />
      Open
    </Badge>
  )
}

export const PriorityBadge = ({ priority }: { priority: IssuePriority }) => {
  const label =
    priorityOptions.find((option) => option.value === priority)?.label ??
    priority
  const className =
    priority === "urgent"
      ? "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300"
      : priority === "high"
        ? "border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-300"
        : priority === "medium"
          ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300"
          : priority === "low"
            ? "border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-300"
            : "border-border bg-muted text-muted-foreground"

  return (
    <Badge
      className={className}
      variant="outline"
      data-testid={`priority-${priority}`}
    >
      <FlagIcon aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  )
}

export const AllIssueStatusesBadge = () => (
  <Badge
    className="border-border bg-muted text-foreground"
    variant="outline"
    data-testid="status-all"
  >
    <ListFilterIcon aria-hidden="true" />
    All issues
  </Badge>
)

export const AllIssuePrioritiesBadge = () => (
  <Badge
    className="border-border bg-muted text-foreground"
    variant="outline"
    data-testid="priority-all"
  >
    <FlagIcon aria-hidden="true" />
    All priorities
  </Badge>
)
