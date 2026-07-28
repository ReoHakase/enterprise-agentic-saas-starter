import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CircleDotIcon,
  FlagIcon,
  HashIcon,
  HistoryIcon,
  type LucideIcon,
} from "lucide-react"
import { useCallback } from "react"

import type { IssueSearchPatch, IssueSearchState } from "../../search-params"
import {
  isTableSort,
  tableDirectionOptions,
  tableSortOptions,
} from "../issues-table-utils/issues-table-utils"

const sortPresentation = {
  number: { icon: HashIcon, label: "Number" },
  createdAt: { icon: CalendarDaysIcon, label: "Created" },
  updatedAt: { icon: HistoryIcon, label: "Updated" },
  dueDate: { icon: CalendarClockIcon, label: "Due date" },
  priority: { icon: FlagIcon, label: "Priority" },
  status: { icon: CircleDotIcon, label: "Status" },
} satisfies Record<
  IssueSearchState["sort"],
  { icon: LucideIcon; label: string }
>

const directionPresentation = {
  asc: { icon: ArrowUpIcon, label: "Ascending" },
  desc: { icon: ArrowDownIcon, label: "Descending" },
} satisfies Record<IssueSearchState["dir"], { icon: LucideIcon; label: string }>

export const IssuesTableSortControls = ({
  state,
  onViewChange,
}: {
  state: IssueSearchState
  onViewChange: (patch: IssueSearchPatch) => void
}) => {
  const handleSortChange = useCallback(
    (value: string | null) => {
      if (isTableSort(value)) onViewChange({ sort: value, page: 1 })
    },
    [onViewChange]
  )
  const handleDirectionChange = useCallback(
    (value: string | null) => {
      if (value === "asc" || value === "desc")
        onViewChange({ dir: value, page: 1 })
    },
    [onViewChange]
  )
  const selectedSort = sortPresentation[state.sort]
  const SelectedSortIcon = selectedSort.icon
  const selectedDirection = directionPresentation[state.dir]
  const SelectedDirectionIcon = selectedDirection.icon
  return (
    <>
      <Select
        items={tableSortOptions}
        value={state.sort}
        onValueChange={handleSortChange}
      >
        <SelectTrigger aria-label="Sort issues" data-sort-value={state.sort}>
          <SelectedSortIcon
            aria-hidden="true"
            data-testid={`sort-icon-${state.sort}`}
          />
          {selectedSort.label}
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {tableSortOptions.map((option) => {
              const presentation = sortPresentation[option.value]
              const Icon = presentation.icon
              return (
                <SelectItem key={option.value} value={option.value}>
                  <Icon
                    aria-hidden="true"
                    data-testid={`sort-option-icon-${option.value}`}
                  />
                  {presentation.label}
                </SelectItem>
              )
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        items={tableDirectionOptions}
        value={state.dir}
        onValueChange={handleDirectionChange}
      >
        <SelectTrigger
          aria-label="Set issue sort direction"
          data-sort-direction={state.dir}
        >
          <SelectedDirectionIcon
            aria-hidden="true"
            data-testid={`sort-direction-icon-${state.dir}`}
          />
          {selectedDirection.label}
        </SelectTrigger>
        <SelectContent>
          {tableDirectionOptions.map((option) => {
            const presentation = directionPresentation[option.value]
            const Icon = presentation.icon
            return (
              <SelectItem key={option.value} value={option.value}>
                <Icon
                  aria-hidden="true"
                  data-testid={`sort-direction-option-icon-${option.value}`}
                />
                {presentation.label}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </>
  )
}
