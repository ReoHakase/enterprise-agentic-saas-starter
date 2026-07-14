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

const describedByIds = (...ids: Array<string | undefined>) =>
  ids.filter((id): id is string => Boolean(id)).join(" ") || undefined

export const IssueStatusFormField = ({
  field,
  onEdit,
  serverErrors,
}: {
  field: IssueStatusFieldApi
  onEdit?: (field: string) => void
  serverErrors?: string[]
}) => {
  const handleValueChange = useCallback(
    (value: string | null) => {
      if (isIssueStatus(value)) {
        onEdit?.(field.name)
        field.handleChange(value)
      }
    },
    [field, onEdit]
  )
  const serverErrorId = serverErrors?.length
    ? "issue-detail-status-server-error"
    : undefined

  return (
    <Field data-invalid={Boolean(serverErrors?.length)}>
      <FieldLabel htmlFor="issue-detail-status">Status</FieldLabel>
      <Select
        items={issueStatusOptions}
        value={field.state.value}
        onValueChange={handleValueChange}
      >
        <SelectTrigger
          id="issue-detail-status"
          className="w-full"
          aria-describedby={serverErrorId}
          aria-invalid={Boolean(serverErrors?.length)}
        >
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
        <FieldError id={serverErrorId} role="alert">
          {serverErrors.join(" ")}
        </FieldError>
      ) : null}
    </Field>
  )
}

export const IssuePriorityFormField = ({
  field,
  onEdit,
  serverErrors,
}: {
  field: IssuePriorityFieldApi
  onEdit?: (field: string) => void
  serverErrors?: string[]
}) => {
  const handleValueChange = useCallback(
    (value: string | null) => {
      if (isIssuePriority(value)) {
        onEdit?.(field.name)
        field.handleChange(value)
      }
    },
    [field, onEdit]
  )
  const serverErrorId = serverErrors?.length
    ? "issue-detail-priority-server-error"
    : undefined

  return (
    <Field data-invalid={Boolean(serverErrors?.length)}>
      <FieldLabel htmlFor="issue-detail-priority">Priority</FieldLabel>
      <Select
        items={priorityOptions}
        value={field.state.value}
        onValueChange={handleValueChange}
      >
        <SelectTrigger
          id="issue-detail-priority"
          className="w-full"
          aria-describedby={serverErrorId}
          aria-invalid={Boolean(serverErrors?.length)}
        >
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
        <FieldError id={serverErrorId} role="alert">
          {serverErrors.join(" ")}
        </FieldError>
      ) : null}
    </Field>
  )
}

export const IssueAssigneeFormField = ({
  field,
  assignees,
  items,
  onEdit,
  serverErrors,
}: {
  field: NullableStringFieldApi
  assignees: IssueAssigneeOption[]
  items: { label: string; value: string }[]
  onEdit?: (field: string) => void
  serverErrors?: string[]
}) => {
  const handleValueChange = useCallback(
    (value: string | null) => {
      onEdit?.(field.name)
      field.handleChange(value === "unassigned" ? null : value)
    },
    [field, onEdit]
  )
  const serverErrorId = serverErrors?.length
    ? "issue-detail-assignee-server-error"
    : undefined

  return (
    <Field data-invalid={Boolean(serverErrors?.length)}>
      <FieldLabel htmlFor="issue-detail-assignee">Assignee</FieldLabel>
      <Select
        items={items}
        value={field.state.value ?? "unassigned"}
        onValueChange={handleValueChange}
      >
        <SelectTrigger
          id="issue-detail-assignee"
          className="w-full"
          aria-describedby={serverErrorId}
          aria-invalid={Boolean(serverErrors?.length)}
        >
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
        <FieldError id={serverErrorId} role="alert">
          {serverErrors.join(" ")}
        </FieldError>
      ) : null}
    </Field>
  )
}

export const IssueLabelsFormField = ({
  field,
  onEdit,
  serverErrors,
}: {
  field: LabelsFieldApi
  onEdit?: (field: string) => void
  serverErrors?: string[]
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit?.(field.name)
      field.handleChange(
        [
          ...new Set(
            event.target.value.split(",").map((label) => label.trim())
          ),
        ].filter(Boolean)
      )
    },
    [field, onEdit]
  )
  const descriptionId = `${field.name}-description`
  const serverErrorId = serverErrors?.length
    ? `${field.name}-server-error`
    : undefined

  return (
    <Field data-invalid={Boolean(serverErrors?.length)}>
      <FieldLabel htmlFor={field.name}>Labels</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value.join(", ")}
        onChange={handleChange}
        aria-describedby={describedByIds(descriptionId, serverErrorId)}
        aria-invalid={Boolean(serverErrors?.length)}
        placeholder="billing, bug, customer"
      />
      <FieldDescription id={descriptionId}>
        Separate labels with commas.
      </FieldDescription>
      {serverErrors ? (
        <FieldError id={serverErrorId} role="alert">
          {serverErrors.join(" ")}
        </FieldError>
      ) : null}
    </Field>
  )
}

export const IssueDueDateFormField = ({
  field,
  onEdit,
  serverErrors,
}: {
  field: NullableStringFieldApi
  onEdit?: (field: string) => void
  serverErrors?: string[]
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit?.(field.name)
      field.handleChange(event.target.value || null)
    },
    [field, onEdit]
  )
  const serverErrorId = serverErrors?.length
    ? `${field.name}-server-error`
    : undefined

  return (
    <Field data-invalid={Boolean(serverErrors?.length)}>
      <FieldLabel htmlFor={field.name}>Due date</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type="date"
        value={field.state.value ?? ""}
        onChange={handleChange}
        aria-describedby={serverErrorId}
        aria-invalid={Boolean(serverErrors?.length)}
      />
      {serverErrors ? (
        <FieldError id={serverErrorId} role="alert">
          {serverErrors.join(" ")}
        </FieldError>
      ) : null}
    </Field>
  )
}
