"use client"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  InputGroup,
  InputGroupInput,
} from "@enterprise-agentic-saas/ui/components/input-group"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import { useCallback, type ChangeEvent } from "react"

import type { StringFieldApi } from "./form-types"

export const CreateIssueTitleField = ({
  field,
  serverError,
}: {
  field: StringFieldApi
  serverError?: string
}) => {
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  )

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
          aria-invalid={invalid}
        />
      </InputGroup>
      <FieldDescription>Use a short, actionable sentence.</FieldDescription>
      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
      {serverError ? <FieldError role="alert">{serverError}</FieldError> : null}
    </Field>
  )
}

export const IssueTitleFormField = ({
  field,
  serverErrors,
}: {
  field: StringFieldApi
  serverErrors?: string[]
}) => {
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    [field]
  )

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>Title</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={handleChange}
        aria-invalid={invalid}
        maxLength={200}
      />
      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
      {serverErrors ? (
        <FieldError role="alert">{serverErrors.join(" ")}</FieldError>
      ) : null}
    </Field>
  )
}

export const IssueDescriptionFormField = ({
  field,
  serverErrors,
}: {
  field: StringFieldApi
  serverErrors?: string[]
}) => {
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      field.handleChange(event.target.value),
    [field]
  )

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>Description</FieldLabel>
      <Textarea
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={handleChange}
        aria-invalid={invalid}
        placeholder="Add context, acceptance criteria, or links."
        className="min-h-28"
      />
      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
      {serverErrors ? (
        <FieldError role="alert">{serverErrors.join(" ")}</FieldError>
      ) : null}
    </Field>
  )
}

export const CommentBodyFormField = ({
  field,
  id,
  label,
  labelClassName,
  placeholder,
  className,
  ariaLabel,
  serverError,
}: {
  field: StringFieldApi
  id: string
  label: string
  labelClassName?: string
  placeholder?: string
  className?: string
  ariaLabel?: string
  serverError?: string
}) => {
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      field.handleChange(event.target.value),
    [field]
  )

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
        aria-invalid={invalid}
      />
      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
      {serverError ? <FieldError role="alert">{serverError}</FieldError> : null}
    </Field>
  )
}
