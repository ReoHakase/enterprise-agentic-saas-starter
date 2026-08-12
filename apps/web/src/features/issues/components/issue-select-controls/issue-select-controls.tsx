"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { UserRoundIcon, UsersRoundIcon } from "lucide-react"
import { useCallback, useMemo } from "react"

import { UserProfileImage } from "@/components/user-identity/user-identity"

import type { ControlStateProps } from "../issue-metadata-control-types/issue-metadata-control-types"
import {
  AllIssuePrioritiesBadge,
  AllIssueStatusesBadge,
  isIssuePriority,
  isIssueStatus,
  issueStatusOptions,
  PriorityBadge,
  priorityFilterOptions,
  priorityOptions,
  statusOptions,
  StatusBadge,
} from "../issue-utils/issue-utils"
import type {
  IssueAssigneeOption,
  IssuePriority,
  IssueStatus,
} from "../types/types"

export const IssueStatusControl = ({
  value,
  onValueChange,
  includeAll = false,
  ariaLabel,
  busy,
  className,
  disabled,
  readOnly,
}: ControlStateProps & {
  value: IssueStatus | "all"
  includeAll?: boolean
  onValueChange?: (value: IssueStatus | "all") => void
}) => {
  const handleValueChange = useCallback(
    (nextValue: string | null) => {
      if (
        (isIssueStatus(nextValue) || (includeAll && nextValue === "all")) &&
        nextValue !== value
      ) {
        onValueChange?.(nextValue)
      }
    },
    [includeAll, onValueChange, value]
  )
  const options = includeAll ? statusOptions : issueStatusOptions

  return (
    <Select
      items={options}
      value={value}
      disabled={disabled || !onValueChange}
      readOnly={readOnly || busy}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className={cn("w-full", className)}
        aria-label={ariaLabel}
        aria-busy={busy}
      >
        {value === "all" ? (
          <AllIssueStatusesBadge />
        ) : (
          <StatusBadge status={value} />
        )}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {includeAll ? (
            <SelectItem value="all">
              <AllIssueStatusesBadge />
            </SelectItem>
          ) : null}
          {issueStatusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <StatusBadge status={option.value} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export const IssuePriorityControl = ({
  value,
  onValueChange,
  includeAll = false,
  ariaLabel,
  busy,
  className,
  disabled,
  readOnly,
}: ControlStateProps & {
  value: IssuePriority | "all"
  includeAll?: boolean
  onValueChange?: (value: IssuePriority | "all") => void
}) => {
  const handleValueChange = useCallback(
    (nextValue: string | null) => {
      if (
        (isIssuePriority(nextValue) || (includeAll && nextValue === "all")) &&
        nextValue !== value
      ) {
        onValueChange?.(nextValue)
      }
    },
    [includeAll, onValueChange, value]
  )
  const options = includeAll ? priorityFilterOptions : priorityOptions

  return (
    <Select
      items={options}
      value={value}
      disabled={disabled || !onValueChange}
      readOnly={readOnly || busy}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className={cn("w-full", className)}
        aria-label={ariaLabel}
        aria-busy={busy}
      >
        {value === "all" ? (
          <AllIssuePrioritiesBadge />
        ) : (
          <PriorityBadge priority={value} />
        )}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {includeAll ? (
            <SelectItem value="all">
              <AllIssuePrioritiesBadge />
            </SelectItem>
          ) : null}
          {priorityOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <PriorityBadge priority={option.value} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export const IssueAssigneeControl = ({
  value,
  assignees,
  onValueChange,
  ariaLabel,
  busy,
  className,
  disabled,
  readOnly,
  includeAll = false,
}: ControlStateProps & {
  value: string | null
  assignees: IssueAssigneeOption[]
  includeAll?: boolean
  onValueChange?: (value: string | null) => void
}) => {
  const selected = assignees.find((assignee) => assignee.id === value)
  const emptyValue = includeAll ? "all" : "unassigned"
  const emptyLabel = includeAll ? "All assignees" : "Unassigned"
  const items = useMemo(
    () => [
      { label: emptyLabel, value: emptyValue },
      ...assignees.map((assignee) => ({
        label: assignee.name,
        value: assignee.id,
      })),
    ],
    [assignees, emptyLabel, emptyValue]
  )
  const handleValueChange = useCallback(
    (nextValue: string | null) => {
      const assigneeId = nextValue === emptyValue ? null : nextValue
      if (assigneeId !== value) onValueChange?.(assigneeId)
    },
    [emptyValue, onValueChange, value]
  )

  return (
    <Select
      items={items}
      value={value ?? emptyValue}
      disabled={disabled || !onValueChange}
      readOnly={readOnly || busy}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className={cn("w-full", className)}
        aria-label={ariaLabel}
        aria-busy={busy}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <UserProfileImage user={selected} className="size-6" />
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            {includeAll ? (
              <UsersRoundIcon aria-hidden="true" />
            ) : (
              <UserRoundIcon aria-hidden="true" />
            )}
            <span>{emptyLabel}</span>
          </span>
        )}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectItem value={emptyValue}>
            {includeAll ? (
              <UsersRoundIcon aria-hidden="true" />
            ) : (
              <UserRoundIcon aria-hidden="true" />
            )}
            {emptyLabel}
          </SelectItem>
          {assignees.map((assignee) => (
            <SelectItem key={assignee.id} value={assignee.id}>
              <span className="flex min-w-0 items-center gap-2">
                <UserProfileImage user={assignee} className="size-6" />
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
