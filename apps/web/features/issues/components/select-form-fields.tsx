"use client"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { useCallback, type ChangeEvent } from "react"

import { UserAvatar } from "@/components/user-identity"

import type {
  IssuePriorityFieldApi,
  IssueStatusFieldApi,
  LabelsFieldApi,
  NullableStringFieldApi,
} from "./form-types"
import {
  isIssuePriority,
  isIssueStatus,
  issueStatusOptions,
  priorityOptions,
} from "./issue-utils"
import type { IssueAssigneeOption } from "./types"

export const IssueStatusFormField = ({
  field,
  serverErrors,
}: {
  field: IssueStatusFieldApi
  serverErrors?: string[]
}) => {
  const handleValueChange = useCallback(
    (value: string | null) => {
      if (isIssueStatus(value)) {
        field.handleChange(value)
      }
    },
    [field]
  )

  return (
    <Field>
      <FieldLabel htmlFor="issue-detail-status">Status</FieldLabel>
      <Select
        items={issueStatusOptions}
        value={field.state.value}
        onValueChange={handleValueChange}
      >
        <SelectTrigger id="issue-detail-status" className="w-full">
          <span className="min-w-0 flex-1 truncate text-left">
            {issueStatusOptions.find(
              (option) => option.value === field.state.value
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
      {serverErrors ? (
        <FieldError role="alert">{serverErrors.join(" ")}</FieldError>
      ) : null}
    </Field>
  )
}

export const IssuePriorityFormField = ({
  field,
  serverErrors,
}: {
  field: IssuePriorityFieldApi
  serverErrors?: string[]
}) => {
  const handleValueChange = useCallback(
    (value: string | null) => {
      if (isIssuePriority(value)) {
        field.handleChange(value)
      }
    },
    [field]
  )

  return (
    <Field>
      <FieldLabel htmlFor="issue-detail-priority">Priority</FieldLabel>
      <Select
        items={priorityOptions}
        value={field.state.value}
        onValueChange={handleValueChange}
      >
        <SelectTrigger id="issue-detail-priority" className="w-full">
          <span className="min-w-0 flex-1 truncate text-left">
            {priorityOptions.find(
              (option) => option.value === field.state.value
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
      {serverErrors ? (
        <FieldError role="alert">{serverErrors.join(" ")}</FieldError>
      ) : null}
    </Field>
  )
}

export const IssueAssigneeFormField = ({
  field,
  assignees,
  items,
  serverErrors,
}: {
  field: NullableStringFieldApi
  assignees: IssueAssigneeOption[]
  items: { label: string; value: string }[]
  serverErrors?: string[]
}) => {
  const handleValueChange = useCallback(
    (value: string | null) =>
      field.handleChange(value === "unassigned" ? null : value),
    [field]
  )

  return (
    <Field>
      <FieldLabel htmlFor="issue-detail-assignee">Assignee</FieldLabel>
      <Select
        items={items}
        value={field.state.value ?? "unassigned"}
        onValueChange={handleValueChange}
      >
        <SelectTrigger id="issue-detail-assignee" className="w-full">
          <span className="min-w-0 flex-1 truncate text-left">
            {assignees.find((assignee) => assignee.id === field.state.value)
              ?.name ?? "Unassigned"}
          </span>
        </SelectTrigger>
        <SelectContent>
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
      {serverErrors ? (
        <FieldError role="alert">{serverErrors.join(" ")}</FieldError>
      ) : null}
    </Field>
  )
}

export const IssueLabelsFormField = ({
  field,
  serverErrors,
}: {
  field: LabelsFieldApi
  serverErrors?: string[]
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(
        [
          ...new Set(
            event.target.value.split(",").map((label) => label.trim())
          ),
        ].filter(Boolean)
      ),
    [field]
  )

  return (
    <Field>
      <FieldLabel htmlFor={field.name}>Labels</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value.join(", ")}
        onChange={handleChange}
        placeholder="billing, bug, customer"
      />
      <FieldDescription>Separate labels with commas.</FieldDescription>
      {serverErrors ? (
        <FieldError role="alert">{serverErrors.join(" ")}</FieldError>
      ) : null}
    </Field>
  )
}

export const IssueDueDateFormField = ({
  field,
  serverErrors,
}: {
  field: NullableStringFieldApi
  serverErrors?: string[]
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value || null),
    [field]
  )

  return (
    <Field>
      <FieldLabel htmlFor={field.name}>Due date</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type="date"
        value={field.state.value ?? ""}
        onChange={handleChange}
      />
      {serverErrors ? (
        <FieldError role="alert">{serverErrors.join(" ")}</FieldError>
      ) : null}
    </Field>
  )
}
