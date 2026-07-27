"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Calendar } from "@enterprise-agentic-saas/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@enterprise-agentic-saas/ui/components/popover"
import { CalendarDaysIcon } from "lucide-react"
import { useCallback, useId, useMemo } from "react"

import {
  formatLocalDate,
  getLocalBoundaryOffset,
  parseLocalDate,
} from "./due-date-local-calendar"
import type { IssueTableDraftChange } from "./issues-table-searchable-filters"

type CalendarRange = { from: Date | undefined; to?: Date }

const dueDateTrigger = <Button variant="outline" size="sm" />
const dueDateSummaryFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const dueDateSummaryWithYearFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const getDateOnlyYear = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  return match ? Number(match[1]) : undefined
}

const formatDateOnlySummary = (value: string, includeYear: boolean) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!match) return value
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  )
  return (
    includeYear ? dueDateSummaryWithYearFormatter : dueDateSummaryFormatter
  ).format(date)
}

const formatDueDateFilterSummary = ({
  dueFrom,
  dueTo,
}: {
  dueFrom: string
  dueTo: string
}) => {
  const currentYear = new Date().getFullYear()
  const fromYear = getDateOnlyYear(dueFrom)
  const toYear = getDateOnlyYear(dueTo)
  if (dueFrom && dueTo) {
    const includeYear =
      fromYear !== currentYear || toYear !== currentYear || fromYear !== toYear
    return `${formatDateOnlySummary(dueFrom, includeYear)} – ${formatDateOnlySummary(dueTo, includeYear)}`
  }
  if (dueFrom)
    return `From ${formatDateOnlySummary(dueFrom, fromYear !== currentYear)}`
  if (dueTo)
    return `Through ${formatDateOnlySummary(dueTo, toYear !== currentYear)}`
  return ""
}

export const DueDateFilter = ({
  dueFrom,
  dueTo,
  onChange,
  onApply,
}: {
  dueFrom: string
  dueTo: string
  onChange: IssueTableDraftChange
  onApply: () => void
}) => {
  const summaryId = useId()
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onApply()
    },
    [onApply]
  )
  const summary = formatDueDateFilterSummary({ dueFrom, dueTo })
  const parsedFrom = useMemo(() => parseLocalDate(dueFrom), [dueFrom])
  const parsedTo = useMemo(() => parseLocalDate(dueTo), [dueTo])
  const selected = useMemo<CalendarRange | undefined>(() => {
    if (parsedFrom) return { from: parsedFrom, to: parsedTo }
    return parsedTo ? { from: parsedTo, to: undefined } : undefined
  }, [parsedFrom, parsedTo])
  const handleCalendarSelect = useCallback(
    (range: CalendarRange | undefined) => {
      const first = range?.from ? formatLocalDate(range.from) : ""
      const second = range?.to ? formatLocalDate(range.to) : ""
      const [from, to] =
        first && second && first > second ? [second, first] : [first, second]
      onChange("dueFrom", from)
      onChange("dueFromOffset", getLocalBoundaryOffset(from))
      onChange("dueTo", to)
      onChange("dueToOffset", getLocalBoundaryOffset(to, 1))
    },
    [onChange]
  )
  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={dueDateTrigger}
        aria-label="Due date"
        aria-describedby={summary ? summaryId : undefined}
        data-filter-state={dueFrom || dueTo ? "active" : "default"}
        className={dueFrom || dueTo ? "border-primary text-primary" : undefined}
      >
        <CalendarDaysIcon aria-hidden="true" />
        Due date
        {summary ? (
          <>
            <span className="max-w-40 truncate text-xs" aria-hidden="true">
              {summary}
            </span>
            <span id={summaryId} className="sr-only">
              Due date filter: {summary}
            </span>
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        data-slot="due-date-filter-content"
        className="grid max-h-(--available-height) w-fit max-w-(--available-width) overflow-x-hidden overflow-y-auto overscroll-contain p-0"
        align="start"
        collisionPadding={16}
        sticky
      >
        <Calendar
          className="mx-auto"
          mode="range"
          numberOfMonths={1}
          selected={selected}
          onSelect={handleCalendarSelect}
          defaultMonth={parsedFrom ?? parsedTo ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  )
}
