"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from "@enterprise-agentic-saas/ui/components/combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { ListFilterIcon } from "lucide-react"
import { useCallback, useId, useMemo, useState, type ReactNode } from "react"

export type DataTableFilterOption<TValue, TMeta = undefined> = {
  value: TValue
  label: string
  keywords?: string[]
  pinnedBadge?: string
  meta?: TMeta
}
const facetedFilterTrigger = <Button variant="outline" size="sm" />

export const DataTableFacetedFilter = <
  TValue extends string,
  TMeta = undefined,
>({
  label,
  icon,
  options,
  values,
  onValuesChange,
  searchable = false,
  searchValue,
  onSearchValueChange,
  onOpenChange,
  renderOption,
  summary,
  summaryLabel,
  children,
  className,
}: {
  label: string
  icon?: ReactNode
  options: DataTableFilterOption<TValue, TMeta>[]
  values: TValue[]
  onValuesChange: (values: TValue[]) => void
  searchable?: boolean
  searchValue?: string
  onSearchValueChange?: (value: string) => void
  onOpenChange?: (open: boolean) => void
  renderOption?: (
    option: DataTableFilterOption<TValue, TMeta>,
    pinnedBadge?: string
  ) => ReactNode
  summary?: ReactNode
  summaryLabel?: string
  children?: ReactNode
  className?: string
}) => {
  const summaryId = useId()
  const [localSearch, setLocalSearch] = useState("")
  const query = searchValue ?? localSearch
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-US")
    const pinned = options.filter((option) => option.pinnedBadge !== undefined)
    const regular = options.filter((option) => option.pinnedBadge === undefined)
    const filteredRegular = normalizedQuery
      ? regular.filter((option) =>
          [option.label, ...(option.keywords ?? [])].some((candidate) =>
            candidate.toLocaleLowerCase("en-US").includes(normalizedQuery)
          )
        )
      : regular
    return [...pinned, ...filteredRegular]
  }, [options, query])
  const pinnedCount = visibleOptions.filter(
    (option) => option.pinnedBadge !== undefined
  ).length
  const handleSearchChange = useCallback(
    (value: string) => {
      if (searchValue === undefined) setLocalSearch(value)
      onSearchValueChange?.(value)
    },
    [onSearchValueChange, searchValue]
  )
  const optionByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options]
  )
  const itemToStringLabel = useCallback(
    (value: TValue) => optionByValue.get(value)?.label ?? value,
    [optionByValue]
  )
  const items = useMemo(
    () => visibleOptions.map((option) => option.value),
    [visibleOptions]
  )
  const triggerContent = (
    <>
      {icon ?? <ListFilterIcon aria-hidden="true" />}
      {label}
      {values.length > 0 ? (
        <>
          <span
            aria-hidden="true"
            className="inline-flex items-center leading-none"
          >
            {summary ?? <Badge variant="secondary">{values.length}</Badge>}
          </span>
          {summaryLabel ? (
            <span id={summaryId} className="sr-only">
              {summaryLabel}
            </span>
          ) : null}
        </>
      ) : null}
    </>
  )
  if (!searchable) {
    return (
      <Select
        multiple
        value={values}
        onValueChange={onValuesChange}
        onOpenChange={onOpenChange}
      >
        <SelectTrigger
          size="sm"
          aria-label={label}
          aria-describedby={
            values.length > 0 && summaryLabel ? summaryId : undefined
          }
          className={cn(
            "border-border bg-background hover:bg-muted data-[filter-state=active]:border-primary data-[filter-state=active]:text-primary",
            className
          )}
          data-filter-state={values.length > 0 ? "active" : "default"}
        >
          {triggerContent}
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              label={option.label}
            >
              {renderOption
                ? renderOption(option, option.pinnedBadge)
                : option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  return (
    <Combobox
      items={items}
      filter={null}
      multiple
      value={values}
      inputValue={query}
      onInputValueChange={handleSearchChange}
      onValueChange={onValuesChange}
      onOpenChange={onOpenChange}
      itemToStringLabel={itemToStringLabel}
    >
      <ComboboxTrigger
        render={facetedFilterTrigger}
        role="button"
        aria-label={label}
        aria-describedby={
          values.length > 0 && summaryLabel ? summaryId : undefined
        }
        className={cn(
          "data-[filter-state=active]:border-primary data-[filter-state=active]:text-primary",
          className
        )}
        data-filter-state={values.length > 0 ? "active" : "default"}
      >
        {triggerContent}
      </ComboboxTrigger>
      <ComboboxContent className="w-72" aria-label={`${label} filter`}>
        {searchable ? (
          <div
            data-slot="data-table-faceted-filter-search"
            className="p-2 pb-0"
          >
            <ComboboxInput
              aria-label={`Search ${label.toLocaleLowerCase("en-US")}`}
              placeholder={`Search ${label.toLocaleLowerCase("en-US")}`}
              showTrigger={false}
            />
          </div>
        ) : null}
        <ComboboxEmpty>No options found.</ComboboxEmpty>
        <ComboboxList className="p-2">
          {visibleOptions.map((option, index) => (
            <span key={option.value}>
              {index === pinnedCount && pinnedCount > 0 ? (
                <ComboboxSeparator />
              ) : null}
              <ComboboxItem value={option.value}>
                {renderOption
                  ? renderOption(option, option.pinnedBadge)
                  : option.label}
              </ComboboxItem>
            </span>
          ))}
        </ComboboxList>
        {children ? (
          <div
            data-slot="data-table-faceted-filter-mode"
            className="border-t p-2"
          >
            {children}
          </div>
        ) : null}
      </ComboboxContent>
    </Combobox>
  )
}
