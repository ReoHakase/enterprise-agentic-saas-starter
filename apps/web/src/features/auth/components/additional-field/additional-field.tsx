"use client"

import {
  type AdditionalField as AdditionalFieldConfig,
  resolveInputType,
} from "@better-auth-ui/core"
import { useAuth } from "@better-auth-ui/react"
import { buttonVariants } from "@enterprise-agentic-saas/ui/components/button"
import { Calendar } from "@enterprise-agentic-saas/ui/components/calendar"
import {
  Field,
  FieldError,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@enterprise-agentic-saas/ui/components/popover"
import { Slider } from "@enterprise-agentic-saas/ui/components/slider"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { format } from "date-fns"
import { CalendarIcon, ChevronDownIcon } from "lucide-react"
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useState,
} from "react"

import { additionalFieldControl as AdditionalFieldControl } from "../additional-field-controls/additional-field-controls"

export type AdditionalFieldProps = {
  name: string
  field: AdditionalFieldConfig
  isPending?: boolean
}

const padTimePart = (value: number) => value.toString().padStart(2, "0")
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

/** Renders a single additional user field via shadcn primitives. */
export function AdditionalField({
  name,
  field,
  isPending,
}: AdditionalFieldProps) {
  const inputType = resolveInputType(field)

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

  if (inputType === "slider") {
    return <SliderField name={name} field={field} isPending={isPending} />
  }

  if (inputType === "date" || inputType === "datetime") {
    return <DateInput name={name} field={field} isPending={isPending} />
  }

  return (
    <AdditionalFieldControl
      inputType={inputType}
      name={name}
      field={field}
      isPending={isPending}
    />
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

  const [date, setDate] = useState<Date | undefined>(() =>
    toDate(field.defaultValue)
  )
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
            type="button"
            id={`${name}-date`}
            data-empty={!date}
            aria-invalid={!!error}
            disabled={isPending || field.readOnly}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "flex-1 justify-between font-normal",
              "data-[empty=true]:text-muted-foreground"
            )}
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
