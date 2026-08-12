"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
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
import { PlusIcon } from "lucide-react"
import { useCallback, useMemo, useState, type KeyboardEvent } from "react"

import type { ControlStateProps } from "../issue-metadata-control-types/issue-metadata-control-types"

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
            <ComboboxChip key={label} removeLabel={`Remove ${label} label`}>
              {label}
            </ComboboxChip>
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
