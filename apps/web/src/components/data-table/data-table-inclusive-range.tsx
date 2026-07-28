"use client"

import { Slider } from "@enterprise-agentic-saas/ui/components/slider"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@enterprise-agentic-saas/ui/components/toggle-group"
import { useCallback, useMemo, type ReactNode } from "react"

export type DataTableOrderedRangeOption<TValue extends string> = {
  value: TValue
  label: string
}

export const DataTableInclusiveRange = <TValue extends string>({
  options,
  minimum,
  maximum,
  renderOption,
  onChange,
}: {
  options: DataTableOrderedRangeOption<TValue>[]
  minimum: TValue
  maximum: TValue
  renderOption: (option: DataTableOrderedRangeOption<TValue>) => ReactNode
  onChange: (minimum: TValue, maximum: TValue) => void
}) => {
  const minimumIndex = Math.max(
    options.findIndex((option) => option.value === minimum),
    0
  )
  const maximumIndex = Math.max(
    options.findIndex((option) => option.value === maximum),
    minimumIndex
  )
  const sliderValue = useMemo(
    () => [minimumIndex, maximumIndex],
    [maximumIndex, minimumIndex]
  )
  const handleValueChange = useCallback(
    (value: number | readonly number[]) => {
      if (!Array.isArray(value)) return
      const from = options[value[0] ?? 0]
      const to = options[value[1] ?? options.length - 1]
      if (from && to) onChange(from.value, to.value)
    },
    [onChange, options]
  )
  const labelThumb = useCallback(
    (index: number) => (index === 0 ? "Minimum priority" : "Maximum priority"),
    []
  )
  const singletonValue = minimum === maximum ? minimum : ""
  const selectSingleton = useCallback(
    (value: string) => {
      const option = options.find((candidate) => candidate.value === value)
      if (option) onChange(option.value, option.value)
    },
    [onChange, options]
  )
  return (
    <div className="grid grid-cols-[auto_1fr] gap-4">
      <Slider
        orientation="vertical"
        min={0}
        max={options.length - 1}
        step={1}
        value={sliderValue}
        getAriaLabel={labelThumb}
        onValueChange={handleValueChange}
      />
      <ToggleGroup
        type="single"
        orientation="vertical"
        loopFocus
        required
        value={singletonValue}
        onValueChange={selectSingleton}
        variant="default"
        size="sm"
        className="flex min-h-40 flex-col justify-between gap-1 rounded-none"
        aria-label="Priority singleton"
      >
        {options.toReversed().map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="h-auto w-full justify-start rounded-md px-1 py-0.5 data-pressed:bg-muted data-pressed:text-foreground"
            aria-label={`Only ${option.label}`}
          >
            {renderOption(option)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
