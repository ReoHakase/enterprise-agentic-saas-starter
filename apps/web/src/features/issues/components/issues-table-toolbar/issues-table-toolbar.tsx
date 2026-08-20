import { Button } from "@enterprise-agentic-saas/ui/components/button"
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
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import type { Table } from "@tanstack/react-table"
import {
  ArrowUpDownIcon,
  CircleDotIcon,
  FlagIcon,
  ListFilterIcon,
  SearchIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useId,
  useMemo,
  type ChangeEvent,
  type RefObject,
} from "react"

import {
  DataTableToolbar,
  DataTableToolbarGroup,
  DataTableToolbarGroupActions,
  DataTableToolbarLabel,
  DataTableToolbarRow,
} from "@/components/data-table/data-table"
import {
  DataTableFacetedFilter,
  type DataTableFilterOption,
} from "@/components/data-table/data-table-faceted-filter"
import { DataTableInclusiveRange } from "@/components/data-table/data-table-inclusive-range"

import type { IssueSearchPatch, IssueSearchState } from "../../search-params"
import { CreateIssueDialog } from "../create-issue-dialog/create-issue-dialog"
import {
  issueStatusOptions,
  priorityOptions,
  PriorityBadge,
  StatusBadge,
} from "../issue-utils/issue-utils"
import { IssuesTableSortControls } from "../issues-table-sort-controls/issues-table-sort-controls"
import type { AsyncAction, IssueAssigneeOption, IssueUiItem } from "../types"
import {
  IssueAssigneeFilter,
  IssueLabelFilter,
  type IssueTableDraftChange,
} from "./issues-table-searchable-filters"

const emptyValues: string[] = []
const emptyStatuses: IssueSearchState["statuses"] = []
const filterPopoverTrigger = <Button variant="outline" size="sm" />
const statusFilterIcon = <CircleDotIcon aria-hidden="true" />
type DraftChange = IssueTableDraftChange
import { DueDateFilter } from "./issues-table-due-date-filter"

export const issuesTableToolbar = ({
  organizationId,
  currentUserId,
  pending,
  searchState,
  searchDraft,
  draft,
  assignees,
  labelOptions,
  onCreate,
  onSearchChange,
  onClearSearch,
  onLabelSearchChange,
  onDraftChange,
  onApplyDraft,
  onResetFilters,
  canResetFilters,
  onResetSort,
  canResetSort,
  searchInputRef,
  onViewChange,
}: {
  organizationId: string
  currentUserId: string
  pending?: boolean
  searchState: IssueSearchState
  searchDraft: string
  draft: IssueSearchPatch
  assignees: IssueAssigneeOption[]
  labelOptions: string[]
  onCreate: AsyncAction<[title: string]>
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void
  onClearSearch: () => void
  onLabelSearchChange: (search: string) => void
  onDraftChange: DraftChange
  onApplyDraft: () => void
  onResetFilters: () => void
  canResetFilters: boolean
  onResetSort: () => void
  canResetSort: boolean
  searchInputRef: RefObject<HTMLInputElement | null>
  onViewChange: (patch: IssueSearchPatch) => void
}) => (
  <>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-semibold">Organization issues</h2>
        <p className="text-sm text-muted-foreground">
          Track work with searchable, sortable, tenant-scoped issues.
        </p>
      </div>
      <CreateIssueDialog
        organizationId={organizationId}
        pending={pending}
        onCreate={onCreate}
      />
    </div>
    <DataTableToolbar role="toolbar" aria-label="Issue table controls">
      <DataTableToolbarRow data-toolbar-row="search">
        <InputGroup className="w-full md:max-w-sm">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchInputRef}
            type="search"
            data-toolbar-placement="standalone"
            className="[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none"
            value={searchDraft}
            onChange={onSearchChange}
            placeholder="Search issues"
            aria-label="Search issues"
          />
          {searchDraft ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear issue search"
                onClick={onClearSearch}
              >
                <XIcon aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </DataTableToolbarRow>
      <DataTableToolbarRow
        data-toolbar-row="controls"
        className="items-start gap-1.5"
      >
        <DataTableToolbarGroup
          role="group"
          aria-label="Issue filters"
          className="w-fit max-w-full gap-1.5 p-1.5"
        >
          <DataTableToolbarLabel>
            <ListFilterIcon aria-hidden="true" />
            Filters
          </DataTableToolbarLabel>
          <StatusFilter
            values={draft.statuses ?? emptyStatuses}
            onChange={onDraftChange}
            onApply={onApplyDraft}
          />
          <PriorityFilter
            minimum={draft.priorityFrom ?? "no_priority"}
            maximum={draft.priorityTo ?? "urgent"}
            onChange={onDraftChange}
            onApply={onApplyDraft}
          />
          <IssueAssigneeFilter
            values={draft.assignees ?? emptyValues}
            assignees={assignees}
            currentUserId={currentUserId}
            onChange={onDraftChange}
            onApply={onApplyDraft}
          />
          <IssueLabelFilter
            values={draft.labels ?? emptyValues}
            mode={draft.labelMode ?? "any"}
            options={labelOptions}
            onSearchChange={onLabelSearchChange}
            onChange={onDraftChange}
            onApply={onApplyDraft}
          />
          <DueDateFilter
            dueFrom={draft.dueFrom ?? ""}
            dueTo={draft.dueTo ?? ""}
            onChange={onDraftChange}
            onApply={onApplyDraft}
          />
          <DataTableToolbarGroupActions
            role="group"
            aria-label="Issue filter actions"
          >
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reset filters"
              disabled={!canResetFilters}
              onClick={onResetFilters}
            >
              <Undo2Icon aria-hidden="true" />
              Reset
            </Button>
          </DataTableToolbarGroupActions>
        </DataTableToolbarGroup>
        <DataTableToolbarGroup
          role="group"
          aria-label="Issue sorting"
          className="w-fit max-w-full gap-1.5 p-1.5"
        >
          <DataTableToolbarLabel>
            <ArrowUpDownIcon aria-hidden="true" />
            Sort
          </DataTableToolbarLabel>
          <IssuesTableSortControls
            state={searchState}
            onViewChange={onViewChange}
          />
          <DataTableToolbarGroupActions
            role="group"
            aria-label="Issue sort actions"
          >
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reset sort"
              disabled={!canResetSort}
              onClick={onResetSort}
            >
              <Undo2Icon aria-hidden="true" />
              Reset
            </Button>
          </DataTableToolbarGroupActions>
        </DataTableToolbarGroup>
      </DataTableToolbarRow>
    </DataTableToolbar>
  </>
)

const useApplyOnClose = (onApply: () => void) =>
  useCallback(
    (open: boolean) => {
      if (!open) onApply()
    },
    [onApply]
  )

export const RowsPerPage = ({
  table,
  value,
}: {
  table: Table<IssueUiItem>
  value: IssueSearchState["pageSize"]
}) => {
  const handleChange = useCallback(
    (next: string | null) => {
      const pageSize = Number(next)
      if (pageSize === 20 || pageSize === 50 || pageSize === 100) {
        table.setPagination({ pageIndex: 0, pageSize })
      }
    },
    [table]
  )
  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="w-28" aria-label="Issues per page">
        {value} / page
      </SelectTrigger>
      <SelectContent>
        {[20, 50, 100].map((size) => (
          <SelectItem key={size} value={String(size)}>
            {size} / page
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const StatusFilter = ({
  values,
  onChange,
  onApply,
}: {
  values: IssueSearchState["statuses"]
  onChange: DraftChange
  onApply: () => void
}) => {
  const options = useMemo<DataTableFilterOption<IssueUiItem["status"]>[]>(
    () =>
      issueStatusOptions.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    []
  )
  const handleValuesChange = useCallback(
    (next: string[]) =>
      onChange(
        "statuses",
        next.flatMap((value) =>
          value === "open" || value === "in_progress" || value === "closed"
            ? [value]
            : []
        )
      ),
    [onChange]
  )
  const summary = useMemo(
    () => <StatusFilterSummary values={values} />,
    [values]
  )
  const summaryLabel = useMemo(() => {
    const selectedValues = new Set(values)
    const selected = issueStatusOptions.filter((option) =>
      selectedValues.has(option.value)
    )
    return `Selected statuses: ${selected
      .map((option) => option.label)
      .join(", ")}; ${selected.length} total`
  }, [values])
  return (
    <DataTableFacetedFilter
      label="Status"
      icon={statusFilterIcon}
      values={values}
      options={options}
      renderOption={renderStatusOption}
      summary={summary}
      summaryLabel={summaryLabel}
      onValuesChange={handleValuesChange}
      onOpenChange={useApplyOnClose(onApply)}
    />
  )
}

const renderStatusOption = (option: DataTableFilterOption<string>) => (
  <StatusBadge
    status={
      issueStatusOptions.find((candidate) => candidate.value === option.value)
        ?.value ?? "open"
    }
  />
)

const statusDotClasses = {
  open: "bg-zinc-400",
  in_progress: "bg-violet-500",
  closed: "bg-purple-600",
} as const

const StatusFilterSummary = ({
  values,
}: {
  values: IssueSearchState["statuses"]
}) => {
  const selectedValues = new Set(values)
  const ordered = issueStatusOptions.filter((option) =>
    selectedValues.has(option.value)
  )
  return (
    <span className="inline-flex items-center gap-1">
      {ordered.map((option) => (
        <span
          key={option.value}
          data-slot="issue-filter-summary-dot"
          data-testid="issue-filter-summary-dot"
          className={`size-1.5 shrink-0 rounded-full ${statusDotClasses[option.value]}`}
          aria-hidden="true"
        />
      ))}
      <span aria-hidden="true">{ordered.length}</span>
    </span>
  )
}

const PriorityFilter = ({
  minimum,
  maximum,
  onChange,
  onApply,
}: {
  minimum: IssueSearchState["priorityFrom"]
  maximum: IssueSearchState["priorityTo"]
  onChange: DraftChange
  onApply: () => void
}) => {
  const summaryId = useId()
  const active = minimum !== "no_priority" || maximum !== "urgent"
  const selected = priorityOptions.slice(
    priorityOptions.findIndex((option) => option.value === minimum),
    priorityOptions.findIndex((option) => option.value === maximum) + 1
  )
  const summaryLabel = `Selected priorities: ${selected
    .map((option) => option.label)
    .join(", ")}; ${selected.length} total`
  const handleMinimum = useCallback(
    (value: IssueSearchState["priorityFrom"]) =>
      onChange("priorityFrom", value),
    [onChange]
  )
  const handleMaximum = useCallback(
    (value: IssueSearchState["priorityTo"]) => onChange("priorityTo", value),
    [onChange]
  )
  const handleRangeChange = useCallback(
    (
      from: IssueSearchState["priorityFrom"],
      to: IssueSearchState["priorityTo"]
    ) => {
      handleMinimum(from)
      handleMaximum(to)
    },
    [handleMaximum, handleMinimum]
  )
  return (
    <Popover onOpenChange={useApplyOnClose(onApply)}>
      <PopoverTrigger
        render={filterPopoverTrigger}
        aria-label="Priority"
        aria-describedby={active ? summaryId : undefined}
        data-filter-state={active ? "active" : "default"}
        className={active ? "border-primary text-primary" : undefined}
      >
        <FlagIcon aria-hidden="true" />
        Priority
        {active ? (
          <>
            <span aria-hidden="true">
              <PriorityFilterSummary minimum={minimum} maximum={maximum} />
            </span>
            <span id={summaryId} className="sr-only">
              {summaryLabel}
            </span>
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        className="w-72"
        align="start"
        aria-label="Priority filter"
      >
        <DataTableInclusiveRange
          options={priorityOptions}
          minimum={minimum}
          maximum={maximum}
          renderOption={renderPriorityRangeOption}
          onChange={handleRangeChange}
        />
      </PopoverContent>
    </Popover>
  )
}

const priorityDotClasses = {
  no_priority: "bg-zinc-400",
  low: "bg-blue-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
} as const

const PriorityFilterSummary = ({
  minimum,
  maximum,
}: {
  minimum: IssueSearchState["priorityFrom"]
  maximum: IssueSearchState["priorityTo"]
}) => {
  const minimumIndex = priorityOptions.findIndex(
    (option) => option.value === minimum
  )
  const maximumIndex = priorityOptions.findIndex(
    (option) => option.value === maximum
  )
  const selected = priorityOptions.slice(minimumIndex, maximumIndex + 1)
  return (
    <span className="inline-flex items-center gap-1">
      {selected.map((option) => (
        <span
          key={option.value}
          data-slot="issue-filter-summary-dot"
          data-testid="issue-filter-summary-dot"
          className={`size-1.5 shrink-0 rounded-full ${priorityDotClasses[option.value]}`}
          aria-hidden="true"
        />
      ))}
      <span aria-hidden="true">{selected.length}</span>
    </span>
  )
}

const renderPriorityRangeOption = (
  option: (typeof priorityOptions)[number]
) => <PriorityBadge priority={option.value} />
