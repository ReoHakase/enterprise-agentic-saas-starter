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
  orientation?: ComponentProps<typeof Field>["orientation"]
  serverErrors?: string[]
}

export const FormTextField = ({
  description,
  field,
  id,
  label,
  orientation,
  serverErrors,
  ...inputOptions
}: FormTextFieldProps) => {
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const invalid = locallyInvalid || Boolean(serverErrors?.length)
  const value = typeof field.state.value === "string" ? field.state.value : ""
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      field.handleChange(event.target.value)
    },
    [field]
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
          aria-invalid={invalid}
        />
        {description ? (
          <FieldDescription className="mt-2">{description}</FieldDescription>
        ) : null}
        {locallyInvalid ? (
          <FieldError className="mt-2" errors={field.state.meta.errors} />
        ) : null}
        {serverErrors?.length ? (
          <FieldError className="mt-2" role="alert">
            {serverErrors.join(" ")}
          </FieldError>
        ) : null}
      </div>
    </Field>
  )
}
