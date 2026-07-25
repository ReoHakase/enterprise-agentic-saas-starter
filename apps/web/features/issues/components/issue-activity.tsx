import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import {
  AlignLeftIcon,
  CalendarClockIcon,
  CircleDotIcon,
  FlagIcon,
  HistoryIcon,
  ListPlusIcon,
  PaperclipIcon,
  TagIcon,
  Trash2Icon,
  TypeIcon,
  UserRoundIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { LocalDate } from "@/components/local-date"
import { UserProfileImage } from "@/components/user-identity"

import type { IssueActivity } from "../schema"
import {
  isIssuePriority,
  isIssueStatus,
  PriorityBadge,
  StatusBadge,
} from "./issue-utils"
import type { IssueAssigneeOption } from "./types"

const fieldLabels: Record<NonNullable<IssueActivity["field"]>, string> = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  assignee: "assignee",
  labels: "labels",
  due_date: "due date",
}

const activityPresentation: Record<
  NonNullable<IssueActivity["field"]>,
  { icon: LucideIcon; markerClassName: string }
> = {
  title: {
    icon: TypeIcon,
    markerClassName:
      "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  description: {
    icon: AlignLeftIcon,
    markerClassName:
      "border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  status: {
    icon: CircleDotIcon,
    markerClassName:
      "border-violet-500/30 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  priority: {
    icon: FlagIcon,
    markerClassName:
      "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  assignee: {
    icon: UserRoundIcon,
    markerClassName:
      "border-cyan-500/30 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  },
  labels: {
    icon: TagIcon,
    markerClassName:
      "border-fuchsia-500/30 bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  },
  due_date: {
    icon: CalendarClockIcon,
    markerClassName:
      "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
}

const getActivityPresentation = (activity: IssueActivity) => {
  if (activity.kind === "created") {
    return {
      icon: ListPlusIcon,
      markerClassName:
        "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    }
  }

  if (activity.kind === "file_added") {
    return {
      icon: PaperclipIcon,
      markerClassName:
        "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    }
  }

  if (activity.kind === "file_deleted") {
    return {
      icon: Trash2Icon,
      markerClassName:
        "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    }
  }

  if (activity.kind === "legacy_updated" || !activity.field) {
    return {
      icon: HistoryIcon,
      markerClassName: "border-border bg-muted text-muted-foreground",
    }
  }

  return activityPresentation[activity.field]
}

const formatValue = (value: IssueActivity["fromValue"]) => {
  if (value === null || value === "") return "None"
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "None"
  return value.replaceAll("_", " ")
}

const ActivityValue = ({
  field,
  value,
  assignees,
}: {
  field: IssueActivity["field"]
  value: IssueActivity["fromValue"]
  assignees: IssueAssigneeOption[]
}) => {
  if (typeof value === "string" && field === "status" && isIssueStatus(value)) {
    return <StatusBadge status={value} />
  }
  if (
    typeof value === "string" &&
    field === "priority" &&
    isIssuePriority(value)
  ) {
    return <PriorityBadge priority={value} />
  }
  if (field === "due_date" && typeof value === "string") {
    return (
      <Badge className="h-auto gap-1.5 py-1" variant="outline">
        <CalendarClockIcon aria-hidden="true" />
        <LocalDate includeTime value={value} />
      </Badge>
    )
  }
  if (field === "assignee") {
    if (value === null || value === "") {
      return (
        <Badge className="h-auto py-1" variant="outline">
          <UserRoundXIcon aria-hidden="true" />
          Unassigned
        </Badge>
      )
    }
    if (typeof value === "string") {
      const assignee = assignees.find((candidate) => candidate.id === value)
      const assigneeLabel =
        assignee?.name.trim() || assignee?.email.trim() || "Unknown member"
      return assignee ? (
        <Badge className="h-auto gap-1.5 py-1 pr-2 pl-1" variant="secondary">
          <UserProfileImage user={assignee} className="size-4" />
          {assigneeLabel}
        </Badge>
      ) : (
        <Badge className="h-auto py-1" variant="outline">
          <UserRoundXIcon aria-hidden="true" />
          Former member
        </Badge>
      )
    }
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? (
      <span className="inline-flex flex-wrap gap-1">
        {value.map((item) => (
          <Badge key={item} variant="secondary">
            <TagIcon aria-hidden="true" />
            {item}
          </Badge>
        ))}
      </span>
    ) : (
      <Badge variant="outline">None</Badge>
    )
  }
  return (
    <Badge
      className="h-auto max-w-full py-1"
      variant="outline"
      title={formatValue(value)}
    >
      <span className="truncate">{formatValue(value)}</span>
    </Badge>
  )
}

const InlineActivityValue = ({
  field,
  value,
  assignees,
}: {
  field: IssueActivity["field"]
  value: IssueActivity["fromValue"]
  assignees: IssueAssigneeOption[]
}) => (
  <span className="mx-0.5 inline-flex max-w-full align-middle">
    <ActivityValue field={field} value={value} assignees={assignees} />
  </span>
)

export const IssueActivityItem = ({
  activity,
  assignees,
}: {
  activity: IssueActivity
  assignees: IssueAssigneeOption[]
}) => {
  let description: ReactNode
  if (activity.kind === "created") {
    description = "created this issue"
  } else if (activity.kind === "file_added") {
    description = (
      <>
        attached{" "}
        <span className="font-medium break-all text-foreground">
          {typeof activity.toValue === "string" ? activity.toValue : "a file"}
        </span>
      </>
    )
  } else if (activity.kind === "file_deleted") {
    description = (
      <>
        deleted{" "}
        <span className="font-medium break-all text-foreground">
          {typeof activity.fromValue === "string"
            ? activity.fromValue
            : "a file"}
        </span>
      </>
    )
  } else if (activity.kind === "legacy_updated" || !activity.field) {
    description = "updated this issue"
  } else {
    description = (
      <>
        changed {fieldLabels[activity.field]} from{" "}
        <InlineActivityValue
          field={activity.field}
          value={activity.fromValue}
          assignees={assignees}
        />{" "}
        to{" "}
        <InlineActivityValue
          field={activity.field}
          value={activity.toValue}
          assignees={assignees}
        />
      </>
    )
  }

  const presentation = getActivityPresentation(activity)
  const ActivityIcon = presentation.icon

  return (
    <li
      data-slot="issue-timeline-item"
      className="relative isolate grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 pb-3 before:absolute before:top-4 before:-bottom-3 before:left-[1.09375rem] before:z-0 before:w-px before:bg-border last:pb-0 last:before:hidden"
    >
      <span
        data-slot="issue-timeline-marker"
        data-testid="issue-activity-actor-marker"
        className="relative z-20 flex size-9 items-center justify-center rounded-full bg-(--issue-timeline-surface,var(--color-background)) ring-4 ring-(--issue-timeline-surface,var(--color-background))"
        aria-hidden="true"
      >
        <UserProfileImage user={activity.actor} className="size-8" />
        <span
          data-slot="issue-activity-field-marker"
          data-testid="issue-activity-field-marker"
          className={cn(
            "absolute -right-1 -bottom-1 z-10 flex size-5 items-center justify-center rounded-full border shadow-xs ring-2 ring-(--issue-timeline-surface,var(--color-background)) [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:stroke-[1.75]",
            presentation.markerClassName
          )}
        >
          <ActivityIcon />
        </span>
      </span>
      <div className="flex min-w-0 flex-col gap-1 pt-1.5 sm:flex-row sm:items-start sm:gap-4">
        <p
          data-slot="issue-activity-description"
          data-testid="issue-activity-description"
          className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground"
        >
          <span className="font-medium text-foreground">
            {activity.actor.name}
          </span>{" "}
          {description}
        </p>
        <span className="shrink-0 text-xs leading-6 text-muted-foreground sm:ml-auto sm:text-right">
          <LocalDate includeTime value={activity.createdAt} />
        </span>
      </div>
    </li>
  )
}
