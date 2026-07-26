"use client"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import {
  InputGroup,
  InputGroupInput,
} from "@enterprise-agentic-saas/ui/components/input-group"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import { useCallback, type ChangeEvent } from "react"

import type { StringFieldApi } from "../form-types/form-types"

const describedByIds = (...ids: Array<string | undefined>) =>
  ids.filter((id): id is string => Boolean(id)).join(" ") || undefined

export const CreateIssueTitleField = ({
  field,
  onEdit,
  serverError,
}: {
  field: StringFieldApi
  onEdit?: (field: string) => void
  serverError?: string
}) => {
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const invalid = locallyInvalid || Boolean(serverError)
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit?.(field.name)
      field.handleChange(event.target.value)
    },
    [field, onEdit]
  )
  const descriptionId = `${field.name}-description`
  const localErrorId = locallyInvalid ? `${field.name}-local-error` : undefined
  const serverErrorId = serverError ? `${field.name}-server-error` : undefined

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>Title</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={field.name}
          name={field.name}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={handleChange}
          placeholder="What needs to be done?"
          autoComplete="off"
          aria-describedby={describedByIds(
            descriptionId,
            localErrorId,
            serverErrorId
          )}
          aria-invalid={invalid}
        />
      </InputGroup>
      <FieldDescription id={descriptionId}>
        Use a short, actionable sentence.
      </FieldDescription>
      {locallyInvalid ? (
        <FieldError id={localErrorId} errors={field.state.meta.errors} />
      ) : null}
      {serverError ? (
        <FieldError id={serverErrorId} role="alert">
          {serverError}
        </FieldError>
      ) : null}
    </Field>
  )
}

export const CommentBodyFormField = ({
  field,
  id,
  label,
  labelClassName,
  onEdit,
  placeholder,
  className,
  ariaLabel,
  serverError,
}: {
  field: StringFieldApi
  id: string
  label: string
  labelClassName?: string
  onEdit?: (field: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
  serverError?: string
}) => {
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const invalid = locallyInvalid || Boolean(serverError)
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onEdit?.(field.name)
      field.handleChange(event.target.value)
    },
    [field, onEdit]
  )
  const localErrorId = locallyInvalid ? `${id}-local-error` : undefined
  const serverErrorId = serverError ? `${id}-server-error` : undefined

  return (
    <Field data-invalid={invalid}>
      <FieldLabel className={labelClassName} htmlFor={id}>
        {label}
      </FieldLabel>
      <Textarea
        id={id}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
        aria-label={ariaLabel}
        aria-describedby={describedByIds(localErrorId, serverErrorId)}
        aria-invalid={invalid}
      />
      {locallyInvalid ? (
        <FieldError id={localErrorId} errors={field.state.meta.errors} />
      ) : null}
      {serverError ? (
        <FieldError id={serverErrorId} role="alert">
          {serverError}
        </FieldError>
      ) : null}
    </Field>
  )
}
