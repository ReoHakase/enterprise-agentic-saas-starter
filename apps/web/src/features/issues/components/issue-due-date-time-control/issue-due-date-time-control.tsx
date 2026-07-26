"use client"

import {
  Button,
  buttonVariants,
} from "@enterprise-agentic-saas/ui/components/button"
import { Calendar } from "@enterprise-agentic-saas/ui/components/calendar"
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
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { CalendarClockIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { LocalDate } from "@/components/local-date/local-date"

import type { ControlStateProps } from "../issue-metadata-control-types/issue-metadata-control-types"

const hourOptions = Array.from({ length: 24 }, (_, hour) => {
  const value = hour.toString().padStart(2, "0")
  return { label: value, value }
})
const baseMinuteOptions = ["00", "15", "30", "45"].map((value) => ({
  label: value,
  value,
}))

const getEditableDate = (value: string | null) => {
  const date = value ? new Date(value) : new Date()
  if (!value) date.setHours(9, 0, 0, 0)
  return date
}

const getDueDateValue = (date: Date | null) => date?.toISOString() ?? null

const normalizeDueDateValue = (value: string | null) =>
  value ? getDueDateValue(new Date(value)) : null

export const issueDueDateTimeControl = ({
  value,
  onValueChange,
  ariaLabel,
  busy,
  className,
  disabled,
  readOnly,
}: ControlStateProps & {
  value: string | null
  onValueChange?: (value: string | null) => void
}) => {
  const [open, setOpen] = useState(false)
  const [draftDate, setDraftDate] = useState<Date | null>(() =>
    value ? new Date(value) : null
  )
  const openRef = useRef(false)
  const draftDateRef = useRef<Date | null>(draftDate)
  const initialValueRef = useRef<string | null>(normalizeDueDateValue(value))
  const [timeZone, setTimeZone] = useState<string>()
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])
  useEffect(() => {
    if (openRef.current) return
    const nextDraft = value ? new Date(value) : null
    draftDateRef.current = nextDraft
    setDraftDate(nextDraft)
  }, [value])
  const minuteOptions = useMemo(() => {
    if (!draftDate) return baseMinuteOptions
    const currentMinute = draftDate.getMinutes().toString().padStart(2, "0")
    return baseMinuteOptions.some((option) => option.value === currentMinute)
      ? baseMinuteOptions
      : [
          ...baseMinuteOptions,
          { label: currentMinute, value: currentMinute },
        ].toSorted((left, right) => left.value.localeCompare(right.value))
  }, [draftDate])
  const updateDraft = useCallback((nextDraft: Date | null) => {
    draftDateRef.current = nextDraft
    setDraftDate(nextDraft)
  }, [])
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        if (openRef.current) return
        const nextDraft = value ? new Date(value) : null
        openRef.current = true
        draftDateRef.current = nextDraft
        initialValueRef.current = normalizeDueDateValue(value)
        setDraftDate(nextDraft)
        setOpen(true)
        return
      }

      if (!openRef.current) return
      openRef.current = false
      setOpen(false)

      const nextValue = getDueDateValue(draftDateRef.current)
      if (nextValue !== initialValueRef.current) onValueChange?.(nextValue)
    },
    [onValueChange, value]
  )
  const selectDate = useCallback(
    (date: Date | undefined) => {
      if (!date) return
      const next = draftDate
        ? new Date(draftDate.getTime())
        : getEditableDate(null)
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
      updateDraft(next)
    },
    [draftDate, updateDraft]
  )
  const selectHour = useCallback(
    (hour: string | null) => {
      if (!hour) return
      const next = draftDate
        ? new Date(draftDate.getTime())
        : getEditableDate(null)
      next.setHours(Number(hour), next.getMinutes(), 0, 0)
      updateDraft(next)
    },
    [draftDate, updateDraft]
  )
  const selectMinute = useCallback(
    (minute: string | null) => {
      if (!minute) return
      const next = draftDate
        ? new Date(draftDate.getTime())
        : getEditableDate(null)
      next.setMinutes(Number(minute), 0, 0)
      updateDraft(next)
    },
    [draftDate, updateDraft]
  )
  const clear = useCallback(() => {
    updateDraft(null)
    handleOpenChange(false)
  }, [handleOpenChange, updateDraft])
  const interactionDisabled = disabled || readOnly || busy

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "default" }),
          "w-full justify-start font-normal",
          !value && "text-muted-foreground",
          className
        )}
        disabled={disabled || !onValueChange || readOnly || busy}
        aria-label={ariaLabel}
        aria-busy={busy}
      >
        <CalendarClockIcon data-icon="inline-start" aria-hidden="true" />
        <span className="truncate">
          {value ? <LocalDate value={value} includeTime /> : "No due date"}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={draftDate ?? undefined}
          onSelect={selectDate}
          timeZone={timeZone}
          disabled={interactionDisabled}
        />
        <div className="flex items-center gap-2 border-t p-3">
          <Select
            items={hourOptions}
            value={draftDate?.getHours().toString().padStart(2, "0") ?? "09"}
            disabled={!draftDate || interactionDisabled}
            onValueChange={selectHour}
          >
            <SelectTrigger className="w-24" aria-label="Due hour">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {hourOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span aria-hidden="true">:</span>
          <Select
            items={minuteOptions}
            value={draftDate?.getMinutes().toString().padStart(2, "0") ?? "00"}
            disabled={!draftDate || interactionDisabled}
            onValueChange={selectMinute}
          >
            <SelectTrigger className="w-24" aria-label="Due minute">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {minuteOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            className="ml-auto"
            type="button"
            variant="ghost"
            size="sm"
            disabled={!draftDate || interactionDisabled}
            onClick={clear}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
