"use client"

import type {
  AdditionalField as AdditionalFieldConfig,
  AdditionalFieldInputType,
} from "@better-auth-ui/core"
import { useAuth } from "@better-auth-ui/react"
import { Checkbox } from "@enterprise-agentic-saas/ui/components/checkbox"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@enterprise-agentic-saas/ui/components/combobox"
import {
  Field,
  FieldContent,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@enterprise-agentic-saas/ui/components/select"
import { Switch } from "@enterprise-agentic-saas/ui/components/switch"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import { Check, Copy } from "lucide-react"
import {
  type ComponentProps,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import { reportObservedError } from "@/lib/report-observed-error"

import type { AdditionalFieldProps } from "../additional-field/additional-field"

const emptyOptions: NonNullable<AdditionalFieldConfig["options"]> = []

const CopyButton = ({
  getValue,
  isDisabled,
}: {
  getValue: () => string | undefined
  isDisabled?: boolean
}) => {
  const { localization } = useAuth()
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    const value = getValue()
    if (!value) return

    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      reportObservedError(error, { operation: "auth.field.copy" })
      toast.error("The value could not be copied.")
    }
  }, [getValue])

  return (
    <InputGroupButton
      aria-label={localization.settings.copyToClipboard}
      title={localization.settings.copyToClipboard}
      onClick={handleCopy}
      disabled={isDisabled}
    >
      {copied ? <Check /> : <Copy />}
    </InputGroupButton>
  )
}

const TextareaField = ({ name, field, isPending }: AdditionalFieldProps) => (
  <Field>
    <FieldLabel htmlFor={name}>{field.label}</FieldLabel>
    <Textarea
      id={name}
      name={name}
      defaultValue={
        field.defaultValue == null ? undefined : String(field.defaultValue)
      }
      placeholder={field.placeholder}
      required={field.required}
      readOnly={field.readOnly}
      disabled={isPending}
    />
    <FieldError />
  </Field>
)

const NumberField = ({ name, field, isPending }: AdditionalFieldProps) => {
  const maxFractionDigits = field.formatOptions?.maximumFractionDigits

  return (
    <Field>
      <FieldLabel htmlFor={name}>{field.label}</FieldLabel>
      <Input
        id={name}
        name={name}
        type="number"
        inputMode={maxFractionDigits ? "decimal" : "numeric"}
        min={field.min}
        max={field.max}
        step={
          field.step ??
          (maxFractionDigits ? 1 / 10 ** maxFractionDigits : undefined)
        }
        defaultValue={
          field.defaultValue == null
            ? undefined
            : typeof field.defaultValue === "number"
              ? field.defaultValue
              : String(field.defaultValue)
        }
        placeholder={field.placeholder}
        required={field.required}
        readOnly={field.readOnly}
        disabled={isPending}
      />
      <FieldError />
    </Field>
  )
}

const BooleanField = ({
  inputType,
  name,
  field,
  isPending,
}: AdditionalFieldProps & {
  inputType: "checkbox" | "switch"
}) => {
  const checked = field.defaultValue === true || field.defaultValue === "true"
  const disabled = isPending || field.readOnly

  return (
    <Field orientation="horizontal">
      {inputType === "switch" ? (
        <Switch
          id={name}
          name={name}
          defaultChecked={checked}
          disabled={disabled}
        />
      ) : (
        <Checkbox
          id={name}
          name={name}
          defaultChecked={checked}
          required={field.required}
          disabled={disabled}
        />
      )}
      <FieldContent>
        <FieldLabel htmlFor={name}>{field.label}</FieldLabel>
      </FieldContent>
    </Field>
  )
}

const SelectField = ({ name, field, isPending }: AdditionalFieldProps) => {
  const fieldOptions = field.options ?? emptyOptions
  const selectItems = useMemo(
    () => [
      { label: field.placeholder ?? "Select an option", value: null },
      ...fieldOptions,
    ],
    [field.placeholder, fieldOptions]
  )

  return (
    <Field>
      <FieldLabel htmlFor={name}>{field.label}</FieldLabel>
      <Select
        items={selectItems}
        name={name}
        defaultValue={
          field.defaultValue != null ? String(field.defaultValue) : null
        }
        required={field.required}
        disabled={isPending || field.readOnly}
      >
        <SelectTrigger id={name} className="w-full">
          <SelectValue>
            {(value) =>
              selectItems.find((item) => item.value === value)?.label ??
              field.placeholder ??
              "Select an option"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {fieldOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldError />
    </Field>
  )
}

const ComboboxField = ({ name, field, isPending }: AdditionalFieldProps) => {
  const fieldOptions = field.options ?? emptyOptions

  return (
    <Field>
      <FieldLabel htmlFor={name}>{field.label}</FieldLabel>
      <Combobox
        items={fieldOptions}
        name={name}
        defaultValue={
          field.defaultValue != null ? String(field.defaultValue) : undefined
        }
        required={field.required}
        disabled={isPending || field.readOnly}
      >
        <ComboboxInput placeholder={field.placeholder} id={name} />
        <ComboboxContent>
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          <ComboboxList>
            {(option) => (
              <ComboboxItem key={option.value} value={option}>
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError />
    </Field>
  )
}

const TextInputField = ({ name, field, isPending }: AdditionalFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const getInputValue = useCallback(() => inputRef.current?.value, [])
  const hasPrefix = field.prefix != null
  const hasSuffix = field.suffix != null || field.copyable
  const isNumeric = field.type === "number"
  const maxFractionDigits = field.formatOptions?.maximumFractionDigits
  const nativeInputType = isNumeric ? "number" : undefined
  const nativeInputMode = isNumeric
    ? maxFractionDigits
      ? "decimal"
      : "numeric"
    : undefined
  const nativeStep = maxFractionDigits ? 1 / 10 ** maxFractionDigits : undefined
  const commonProperties: ComponentProps<typeof Input> = {
    id: name,
    name,
    type: nativeInputType,
    inputMode: nativeInputMode,
    step: nativeStep,
    defaultValue:
      field.defaultValue == null ? undefined : String(field.defaultValue),
    placeholder: field.placeholder,
    required: field.required,
    readOnly: field.readOnly,
    disabled: isPending,
  }

  return (
    <Field>
      <FieldLabel htmlFor={name}>{field.label}</FieldLabel>
      {hasPrefix || hasSuffix ? (
        <InputGroup>
          {hasPrefix ? (
            <InputGroupAddon align="inline-start">
              {field.prefix}
            </InputGroupAddon>
          ) : null}
          <InputGroupInput ref={inputRef} {...commonProperties} />
          {field.copyable ? (
            <InputGroupAddon align="inline-end">
              <CopyButton getValue={getInputValue} isDisabled={isPending} />
            </InputGroupAddon>
          ) : field.suffix != null ? (
            <InputGroupAddon align="inline-end">{field.suffix}</InputGroupAddon>
          ) : null}
        </InputGroup>
      ) : (
        <Input {...commonProperties} />
      )}
      <FieldError />
    </Field>
  )
}

const AdditionalFieldControl = ({
  inputType,
  ...props
}: AdditionalFieldProps & { inputType: AdditionalFieldInputType }) => {
  switch (inputType) {
    case "textarea":
      return <TextareaField {...props} />
    case "number":
      return <NumberField {...props} />
    case "switch":
    case "checkbox":
      return <BooleanField {...props} inputType={inputType} />
    case "select":
      return <SelectField {...props} />
    case "combobox":
      return <ComboboxField {...props} />
    default:
      return <TextInputField {...props} />
  }
}

export { AdditionalFieldControl as additionalFieldControl }
