"use client"

import {
  Button,
  buttonVariants,
} from "@enterprise-agentic-saas/ui/components/button"
import { Calendar } from "@enterprise-agentic-saas/ui/components/calendar"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@enterprise-agentic-saas/ui/components/combobox"
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
import { CalendarClockIcon, PlusIcon, UserRoundIcon, XIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"

import { LocalDate } from "@/components/local-date"
import { UserProfileImage } from "@/components/user-identity"

import {
  isIssuePriority,
  isIssueStatus,
  issueStatusOptions,
  PriorityBadge,
  priorityOptions,
  StatusBadge,
} from "./issue-utils"
import type { IssueAssigneeOption, IssuePriority, IssueStatus } from "./types"

type ControlStateProps = {
  ariaLabel: string
  busy?: boolean
  className?: string
  disabled?: boolean
  readOnly?: boolean
}

export const IssueStatusControl = ({
  value,
  onValueChange,
  ariaLabel,
  busy,
  className,
  disabled,
  readOnly,
}: ControlStateProps & {
  value: IssueStatus
  onValueChange?: (value: IssueStatus) => void
}) => {
  const handleValueChange = useCallback(
    (nextValue: string | null) => {
      if (isIssueStatus(nextValue) && nextValue !== value) {
        onValueChange?.(nextValue)
      }
    },
    [onValueChange, value]
  )

  return (
    <Select
      items={issueStatusOptions}
      value={value}
      disabled={disabled || !onValueChange}
      readOnly={readOnly || busy}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className={cn("w-full", className)}
        aria-label={ariaLabel}
        aria-busy={busy}
      >
        <StatusBadge status={value} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {issueStatusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <StatusBadge status={option.value} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export const IssuePriorityControl = ({
  value,
  onValueChange,
  ariaLabel,
  busy,
  className,
  disabled,
  readOnly,
}: ControlStateProps & {
  value: IssuePriority
  onValueChange?: (value: IssuePriority) => void
}) => {
  const handleValueChange = useCallback(
    (nextValue: string | null) => {
      if (isIssuePriority(nextValue) && nextValue !== value) {
        onValueChange?.(nextValue)
      }
    },
    [onValueChange, value]
  )

  return (
    <Select
      items={priorityOptions}
      value={value}
      disabled={disabled || !onValueChange}
      readOnly={readOnly || busy}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className={cn("w-full", className)}
        aria-label={ariaLabel}
        aria-busy={busy}
      >
        <PriorityBadge priority={value} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {priorityOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <PriorityBadge priority={option.value} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export const IssueAssigneeControl = ({
  value,
  assignees,
  onValueChange,
  ariaLabel,
  busy,
  className,
  disabled,
  readOnly,
}: ControlStateProps & {
  value: string | null
  assignees: IssueAssigneeOption[]
  onValueChange?: (value: string | null) => void
}) => {
  const selected = assignees.find((assignee) => assignee.id === value)
  const items = useMemo(
    () => [
      { label: "Unassigned", value: "unassigned" },
      ...assignees.map((assignee) => ({
        label: assignee.name,
        value: assignee.id,
      })),
    ],
    [assignees]
  )
  const handleValueChange = useCallback(
    (nextValue: string | null) => {
      const assigneeId = nextValue === "unassigned" ? null : nextValue
      if (assigneeId !== value) onValueChange?.(assigneeId)
    },
    [onValueChange, value]
  )

  return (
    <Select
      items={items}
      value={value ?? "unassigned"}
      disabled={disabled || !onValueChange}
      readOnly={readOnly || busy}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className={cn("w-full", className)}
        aria-label={ariaLabel}
        aria-busy={busy}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <UserProfileImage user={selected} className="size-6" />
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <UserRoundIcon aria-hidden="true" />
            <span>Unassigned</span>
          </span>
        )}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectItem value="unassigned">
            <UserRoundIcon aria-hidden="true" />
            Unassigned
          </SelectItem>
          {assignees.map((assignee) => (
            <SelectItem key={assignee.id} value={assignee.id}>
              <span className="flex min-w-0 items-center gap-2">
                <UserProfileImage user={assignee} className="size-6" />
                <span className="min-w-0">
                  <span className="block truncate">{assignee.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {assignee.email}
                  </span>
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

const labelKey = (label: string) => label.trim().toLocaleLowerCase()

export const IssueLabelsControl = ({
  value,
  suggestions,
  onValueChange,
  ariaLabel,
  busy,
  disabled,
  readOnly,
}: Omit<ControlStateProps, "className"> & {
  value: string[]
  suggestions: string[]
  onValueChange?: (value: string[]) => void
}) => {
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const items = useMemo(() => {
    const labels = new Map<string, string>()
    for (const label of [...suggestions, ...value]) {
      const trimmed = label.trim()
      if (trimmed) labels.set(labelKey(trimmed), trimmed)
    }
    return [...labels.values()].toSorted((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" })
    )
  }, [suggestions, value])
  const normalizedQuery = query.trim()
  const canAdd =
    normalizedQuery.length > 0 &&
    normalizedQuery.length <= 40 &&
    value.length < 20 &&
    !value.some((label) => labelKey(label) === labelKey(normalizedQuery))
  const changeValue = useCallback(
    (nextValue: string[]) => {
      if (nextValue.length <= 20) onValueChange?.(nextValue)
    },
    [onValueChange]
  )
  const addLabel = useCallback(() => {
    if (!canAdd) return
    changeValue([...value, normalizedQuery])
    setQuery("")
    setOpen(false)
  }, [canAdd, changeValue, normalizedQuery, value])
  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && canAdd) {
        event.preventDefault()
        addLabel()
      }
    },
    [addLabel, canAdd]
  )

  return (
    <Combobox
      items={items}
      multiple
      value={value}
      inputValue={query}
      open={open}
      disabled={disabled || !onValueChange}
      readOnly={readOnly || busy}
      onInputValueChange={setQuery}
      onOpenChange={setOpen}
      onValueChange={changeValue}
    >
      <ComboboxChips ref={anchor} aria-label={ariaLabel} aria-busy={busy}>
        <ComboboxValue>
          {value.map((label) => (
            <ComboboxChip key={label}>{label}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput
          aria-label="Search or create a label"
          placeholder={value.length > 0 ? "Add label" : "Search or add label"}
          onKeyDown={handleInputKeyDown}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>
          {normalizedQuery
            ? "No matching labels. You can create this one."
            : "No labels found."}
        </ComboboxEmpty>
        <ComboboxList>
          {(label: string) => (
            <ComboboxItem key={label} value={label}>
              {label}
            </ComboboxItem>
          )}
        </ComboboxList>
        {canAdd ? (
          <div className="border-t p-1.5">
            <Button
              className="w-full justify-start"
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Add label ${normalizedQuery}`}
              disabled={disabled || readOnly || busy}
              onClick={addLabel}
            >
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              Add “{normalizedQuery}”
            </Button>
          </div>
        ) : null}
      </ComboboxContent>
    </Combobox>
  )
}

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

export const IssueDueDateTimeControl = ({
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
