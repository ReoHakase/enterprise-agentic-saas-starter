"use client"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import type { AnyFieldApi } from "@tanstack/react-form"
import type { ChangeEvent, ComponentProps, ReactNode } from "react"
import { useCallback } from "react"

type InputOptions = Pick<
  ComponentProps<typeof Input>,
  | "autoCapitalize"
  | "autoComplete"
  | "inputMode"
  | "placeholder"
  | "spellCheck"
  | "type"
>

type FormTextFieldProps = InputOptions & {
  description?: ReactNode
  field: AnyFieldApi
  id: string
  label: ReactNode
  onEdit?: (field: string) => void
  orientation?: ComponentProps<typeof Field>["orientation"]
  serverErrors?: string[]
}

export const FormTextField = ({
  description,
  field,
  id,
  label,
  onEdit,
  orientation,
  serverErrors,
  ...inputOptions
}: FormTextFieldProps) => {
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const invalid = locallyInvalid || Boolean(serverErrors?.length)
  const value = typeof field.state.value === "string" ? field.state.value : ""
  const descriptionId = description ? `${id}-description` : undefined
  const localErrorId = locallyInvalid ? `${id}-local-error` : undefined
  const serverErrorId = serverErrors?.length ? `${id}-server-error` : undefined
  const describedBy = [descriptionId, localErrorId, serverErrorId]
    .filter((idValue): idValue is string => Boolean(idValue))
    .join(" ")
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit?.(field.name)
      field.handleChange(event.target.value)
    },
    [field, onEdit]
  )

  return (
    <Field data-invalid={invalid} orientation={orientation}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="w-full sm:max-w-md">
        <Input
          {...inputOptions}
          id={id}
          name={field.name}
          value={value}
          onBlur={field.handleBlur}
          onChange={handleChange}
          aria-describedby={describedBy || undefined}
          aria-invalid={invalid}
        />
        {description ? (
          <FieldDescription id={descriptionId} className="mt-2">
            {description}
          </FieldDescription>
        ) : null}
        {locallyInvalid ? (
          <FieldError
            id={localErrorId}
            className="mt-2"
            errors={field.state.meta.errors}
          />
        ) : null}
        {serverErrors?.length ? (
          <FieldError id={serverErrorId} className="mt-2" role="alert">
            {serverErrors.join(" ")}
          </FieldError>
        ) : null}
      </div>
    </Field>
  )
}
