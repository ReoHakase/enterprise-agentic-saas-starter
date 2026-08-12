"use client"

import {
  Field,
  FieldError,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import {
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from "react"

import type { StringFieldApi } from "../form-types/form-types"

export const TitleEditorField = ({
  field,
  serverError,
  formError,
  onEdit,
  onCancel,
}: {
  field: StringFieldApi
  serverError?: string
  formError?: string
  onEdit: () => void
  onCancel: () => void
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit()
      field.handleChange(event.target.value)
    },
    [field, onEdit]
  )
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onCancel()
    },
    [onCancel]
  )

  return (
    <Field data-invalid={locallyInvalid || Boolean(serverError)}>
      <FieldLabel className="sr-only" htmlFor="issue-title">
        Issue title
      </FieldLabel>
      <Input
        ref={inputRef}
        id="issue-title"
        className="h-auto py-1 font-heading text-xl font-medium sm:text-2xl"
        value={field.state.value}
        maxLength={200}
        aria-invalid={locallyInvalid || Boolean(serverError)}
        onChange={handleChange}
        onBlur={field.handleBlur}
        onKeyDown={handleKeyDown}
      />
      {locallyInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
      {serverError ? <FieldError role="alert">{serverError}</FieldError> : null}
      {formError ? <FieldError role="alert">{formError}</FieldError> : null}
    </Field>
  )
}

export const DescriptionEditorField = ({
  field,
  serverError,
  formError,
  onEdit,
}: {
  field: StringFieldApi
  serverError?: string
  formError?: string
  onEdit: () => void
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => textareaRef.current?.focus(), [])
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onEdit()
      field.handleChange(event.target.value)
    },
    [field, onEdit]
  )

  return (
    <Field data-invalid={locallyInvalid || Boolean(serverError)}>
      <FieldLabel className="sr-only" htmlFor="issue-description">
        Description
      </FieldLabel>
      <Textarea
        ref={textareaRef}
        id="issue-description"
        className="min-h-40 resize-y"
        value={field.state.value}
        maxLength={10_000}
        placeholder="Add context, acceptance criteria, or links."
        aria-invalid={locallyInvalid || Boolean(serverError)}
        onBlur={field.handleBlur}
        onChange={handleChange}
      />
      {locallyInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
      {serverError ? <FieldError role="alert">{serverError}</FieldError> : null}
      {formError ? <FieldError role="alert">{formError}</FieldError> : null}
    </Field>
  )
}
