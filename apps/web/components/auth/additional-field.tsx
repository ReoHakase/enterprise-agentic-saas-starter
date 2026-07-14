"use client"

import {
  type AdditionalField as AdditionalFieldConfig,
  resolveInputType,
} from "@better-auth-ui/core"
import { useAuth } from "@better-auth-ui/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Calendar } from "@enterprise-agentic-saas/ui/components/calendar"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@enterprise-agentic-saas/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@enterprise-agentic-saas/ui/components/select"
import { Slider } from "@enterprise-agentic-saas/ui/components/slider"
import { Switch } from "@enterprise-agentic-saas/ui/components/switch"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { format } from "date-fns"
import { CalendarIcon, Check, ChevronDownIcon, Copy } from "lucide-react"
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

export type AdditionalFieldProps = {
  name: string
  field: AdditionalFieldConfig
  isPending?: boolean
}

const padTimePart = (value: number) => value.toString().padStart(2, "0")
const emptyOptions: NonNullable<AdditionalFieldConfig["options"]> = []
const ignoreInputChange = () => undefined

/** Convert a `defaultValue` into a `Date` for the calendar. */
function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value
  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }
  return undefined
}

/** Format a Date as `HH:mm:ss` for an `<input type="time">`. */
function formatTime(date: Date) {
  return `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:${padTimePart(date.getSeconds())}`
}

/**
 * Icon-only copy button used as an `InputGroupAddon`. `getValue` is invoked
 * lazily on click so the button copies the input's *live* value rather than a
 * stale snapshot — important when paired with editable inputs.
 */
function CopyButton({
  getValue,
  isDisabled,
}: {
  getValue: () => string | undefined
  isDisabled?: boolean
}) {
  const { localization } = useAuth()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const value = getValue()
    if (!value) return

    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
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

/** Renders a single additional user field via shadcn primitives. */
export function AdditionalField({
  name,
  field,
  isPending,
}: AdditionalFieldProps) {
  const inputType = resolveInputType(field)
  // Used by `inputType: "input"` with `copyable: true` so the copy button
  // reads the input's *live* value rather than a stale `defaultValue`.
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldOptions = field.options ?? emptyOptions
  const selectItems = useMemo(
    () => [
      { label: field.placeholder ?? "Select an option", value: null },
      ...fieldOptions,
    ],
    [field.placeholder, fieldOptions]
  )
  const getInputValue = useCallback(() => inputRef.current?.value, [])

  if (field.render) {
    return <>{field.render({ name, field, isPending })}</>
  }

  if (inputType === "hidden") {
    return (
      <input
        type="hidden"
        name={name}
        value={
          field.defaultValue == null
            ? ""
            : field.defaultValue instanceof Date
              ? field.defaultValue.toISOString()
              : String(field.defaultValue)
        }
      />
    )
  }

  if (inputType === "textarea") {
    return (
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
  }

  if (inputType === "number") {
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

  if (inputType === "slider") {
    return <SliderField name={name} field={field} isPending={isPending} />
  }

  if (inputType === "switch") {
    return (
      <Field orientation="horizontal">
        <Switch
          id={name}
          name={name}
          defaultChecked={
            field.defaultValue === true || field.defaultValue === "true"
          }
          disabled={isPending || field.readOnly}
        />

        <FieldContent>
          <FieldLabel htmlFor={name}>{field.label}</FieldLabel>
        </FieldContent>
      </Field>
    )
  }

  if (inputType === "checkbox") {
    return (
      <Field orientation="horizontal">
        <Checkbox
          id={name}
          name={name}
          defaultChecked={
            field.defaultValue === true || field.defaultValue === "true"
          }
          required={field.required}
          disabled={isPending || field.readOnly}
        />

        <FieldContent>
          <FieldLabel htmlFor={name}>{field.label}</FieldLabel>
        </FieldContent>
      </Field>
    )
  }

  if (inputType === "select") {
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

  if (inputType === "combobox") {
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

  if (inputType === "date" || inputType === "datetime") {
    return <DateInput name={name} field={field} isPending={isPending} />
  }

  // inputType === "input"
  const hasPrefix = field.prefix != null
  const hasSuffix = field.suffix != null || field.copyable

  // When `inputType: "input"` is paired with `type: "number"`, restrict the
  // native input to numbers. `formatOptions.maximumFractionDigits` enables
  // fractional input via `step`.
  const isNumeric = field.type === "number"
  const maxFractionDigits = field.formatOptions?.maximumFractionDigits
  const nativeInputType = isNumeric ? "number" : undefined
  const nativeInputMode = isNumeric
    ? maxFractionDigits
      ? "decimal"
      : "numeric"
    : undefined
  const nativeStep = maxFractionDigits ? 1 / 10 ** maxFractionDigits : undefined

  if (hasPrefix || hasSuffix) {
    return (
      <Field>
        <FieldLabel htmlFor={name}>{field.label}</FieldLabel>

        <InputGroup>
          {hasPrefix && (
            <InputGroupAddon align="inline-start">
              {field.prefix}
            </InputGroupAddon>
          )}

          <InputGroupInput
            ref={inputRef}
            id={name}
            name={name}
            type={nativeInputType}
            inputMode={nativeInputMode}
            step={nativeStep}
            defaultValue={
              field.defaultValue == null
                ? undefined
                : String(field.defaultValue)
            }
            placeholder={field.placeholder}
            required={field.required}
            readOnly={field.readOnly}
            disabled={isPending}
          />

          {field.copyable ? (
            <InputGroupAddon align="inline-end">
              <CopyButton getValue={getInputValue} isDisabled={isPending} />
            </InputGroupAddon>
          ) : (
            field.suffix != null && (
              <InputGroupAddon align="inline-end">
                {field.suffix}
              </InputGroupAddon>
            )
          )}
        </InputGroup>

        <FieldError />
      </Field>
    )
  }

  return (
    <Field>
      <FieldLabel htmlFor={name}>{field.label}</FieldLabel>

      <Input
        id={name}
        name={name}
        type={nativeInputType}
        inputMode={nativeInputMode}
        step={nativeStep}
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
}

/**
 * Slider field. Radix Slider doesn't render the current value, so we render
 * it next to the label and control the state to keep the displayed value in
 * sync. The selected value is submitted via the underlying Radix `name` prop.
 */
function SliderField({ name, field, isPending }: AdditionalFieldProps) {
  const maxFractionDigits = field.formatOptions?.maximumFractionDigits
  const min = field.min ?? 0
  const max = field.max ?? 100
  const step =
    field.step ?? (maxFractionDigits ? 1 / 10 ** maxFractionDigits : 1)
  const initial =
    typeof field.defaultValue === "number"
      ? field.defaultValue
      : field.defaultValue != null
        ? Number(field.defaultValue)
        : min

  const [value, setValue] = useState<number>(initial)
  const formatter = useMemo(
    () => new Intl.NumberFormat(undefined, field.formatOptions),
    [field.formatOptions]
  )
  const sliderValue = useMemo(() => [value], [value])
  const handleValueChange = useCallback(
    (nextValue: number | readonly number[]) => {
      const next = Array.isArray(nextValue) ? nextValue[0] : nextValue
      setValue(next ?? min)
    },
    [min]
  )

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={name}>{field.label}</FieldLabel>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatter.format(value)}
        </span>
      </div>

      <Slider
        id={name}
        name={name}
        value={sliderValue}
        onValueChange={handleValueChange}
        min={min}
        max={max}
        step={step}
        disabled={isPending || field.readOnly}
      />

      <FieldError />
    </Field>
  )
}

/**
 * Date / datetime input. Composes `Popover` + `Calendar` for the date and
 * (optionally) `<input type="time">` for the time. Submits the combined ISO
 * value via a hidden `<input>` so it shows up in `FormData`.
 */
function DateInput({ name, field, isPending }: AdditionalFieldProps) {
  const { localization } = useAuth()
  const inputType = resolveInputType(field)
  const isDateTime = inputType === "datetime"

  const [date, setDate] = useState<Date | undefined>(toDate(field.defaultValue))
  const [time, setTime] = useState<string>(
    isDateTime && date ? formatTime(date) : ""
  )
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const handleInvalid = useCallback((event: FormEvent<HTMLInputElement>) => {
    event.preventDefault()
    setError(event.currentTarget.validationMessage)
  }, [])
  const handleSelect = useCallback(
    (value: Date | undefined) => {
      setDate(value)
      if (value) setError(undefined)
      if (!isDateTime) setOpen(false)
    },
    [isDateTime]
  )
  const handleTimeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setTime(event.target.value),
    []
  )

  // Compose the hidden form value: ISO date for "date", ISO datetime for
  // "datetime" (date + time).
  let formValue = ""
  if (date) {
    if (isDateTime && time && time.trim() !== "") {
      const [h = "0", m = "0", s = "0"] = time.split(":")
      const combined = new Date(date)
      combined.setHours(Number(h), Number(m), Number(s), 0)
      formValue = combined.toISOString()
    } else {
      // Anchor to local midnight then serialize as ISO so the downstream
      // `parseAdditionalFieldValue` parses the same calendar day regardless
      // of timezone (a bare "YYYY-MM-DD" would be parsed as UTC midnight).
      // For datetime fields with a blank time, we fall through to this path
      // so an empty time stays blank rather than silently becoming midnight.
      const localMidnight = new Date(date)
      localMidnight.setHours(0, 0, 0, 0)
      formValue = localMidnight.toISOString()
    }
  }

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={`${name}-date`}>{field.label}</FieldLabel>

      <div className="relative flex gap-2">
        {/* Visually-hidden input so required constraint validation fires on submit.
            onInvalid suppresses the native browser balloon and routes the message
            through the styled <FieldError> below — matching the pattern used by
            the Name / Email / Password fields in the sign-up form. */}
        <input
          type="text"
          name={name}
          value={formValue}
          onChange={ignoreInputChange}
          required={field.required}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full opacity-0"
          onInvalid={handleInvalid}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                id={`${name}-date`}
                data-empty={!date}
                aria-invalid={!!error}
                disabled={isPending || field.readOnly}
                className={cn(
                  "flex-1 justify-between font-normal",
                  "data-[empty=true]:text-muted-foreground"
                )}
              />
            }
          >
            {date ? format(date, "PPP") : <span>{field.placeholder}</span>}
            {isDateTime ? <ChevronDownIcon /> : <CalendarIcon />}
          </PopoverTrigger>

          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              defaultMonth={date}
              captionLayout="dropdown"
              onSelect={handleSelect}
            />
          </PopoverContent>
        </Popover>

        {isDateTime && (
          <Field className="w-32">
            <FieldLabel htmlFor={`${name}-time`} className="sr-only">
              {localization.settings.time}
            </FieldLabel>

            <Input
              type="time"
              id={`${name}-time`}
              step="1"
              value={time}
              onChange={handleTimeChange}
              disabled={isPending || field.readOnly}
              className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
          </Field>
        )}
      </div>

      <FieldError>{error}</FieldError>
    </Field>
  )
}
