"use client"

import {
  Field,
  FieldError,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@enterprise-agentic-saas/ui/components/input-group"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { type ChangeEvent, useCallback } from "react"

type FormError = { message?: string } | undefined

type AuthTextFieldProps = {
  autoComplete: string
  disabled: boolean
  errors: FormError[]
  invalid: boolean
  label: string
  name: string
  onBlur: () => void
  onEdit: () => void
  onValueChange: (value: string) => void
  placeholder?: string
  type: "email" | "password" | "text"
  value: string
}

export const AuthTextField = ({
  autoComplete,
  disabled,
  errors,
  invalid,
  label,
  name,
  onBlur,
  onEdit,
  onValueChange,
  placeholder,
  type,
  value,
}: AuthTextFieldProps) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit()
      onValueChange(event.target.value)
    },
    [onEdit, onValueChange]
  )

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onBlur={onBlur}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
      />
      {invalid ? <FieldError errors={errors} /> : null}
    </Field>
  )
}

type AuthPasswordFieldProps = Omit<AuthTextFieldProps, "type"> & {
  hidePasswordLabel: string
  showPasswordLabel: string
  visible: boolean
  onToggleVisibility: () => void
}

export const AuthPasswordField = ({
  autoComplete,
  disabled,
  errors,
  hidePasswordLabel,
  invalid,
  label,
  name,
  onBlur,
  onEdit,
  onToggleVisibility,
  onValueChange,
  placeholder,
  showPasswordLabel,
  value,
  visible,
}: AuthPasswordFieldProps) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit()
      onValueChange(event.target.value)
    },
    [onEdit, onValueChange]
  )
  const visibilityLabel = visible ? hidePasswordLabel : showPasswordLabel

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onBlur={onBlur}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={invalid}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            aria-label={visibilityLabel}
            title={visibilityLabel}
            onClick={onToggleVisibility}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {invalid ? <FieldError errors={errors} /> : null}
    </Field>
  )
}
