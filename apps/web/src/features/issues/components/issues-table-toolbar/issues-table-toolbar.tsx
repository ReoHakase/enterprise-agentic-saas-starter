import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@enterprise-agentic-saas/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { SearchIcon } from "lucide-react"
import type { ChangeEvent } from "react"

import type { IssueSearchState } from "../../search-params"
import { CreateIssueDialog } from "../create-issue-dialog/create-issue-dialog"
import {
  IssueAssigneeControl,
  IssuePriorityControl,
  IssueStatusControl,
} from "../issue-metadata-controls/issue-metadata-controls"
import {
  tableDirectionOptions,
  tableSortOptions,
} from "../issues-table-utils/issues-table-utils"
import type { AsyncAction, IssueAssigneeOption } from "../types/types"

export const issuesTableToolbar = ({
  organizationId,
  pending,
  searchState,
  searchDraft,
  labelDraft,
  assignees,
  onCreate,
  onSearchChange,
  onLabelChange,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onSortChange,
  onDirectionChange,
}: {
  organizationId: string
  pending?: boolean
  searchState: IssueSearchState
  searchDraft: string
  labelDraft: string
  assignees: IssueAssigneeOption[]
  onCreate: AsyncAction<[title: string]>
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void
  onLabelChange: (event: ChangeEvent<HTMLInputElement>) => void
  onStatusChange: (value: IssueSearchState["status"]) => void
  onPriorityChange: (value: IssueSearchState["priority"]) => void
  onAssigneeChange: (value: string | null) => void
  onSortChange: (value: string | null) => void
  onDirectionChange: (value: string | null) => void
}) => (
  <>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-semibold">Organization issues</h2>
        <p className="text-sm text-muted-foreground">
          Track work with searchable, sortable, tenant-scoped issues.
        </p>
      </div>
      <div className="shrink-0">
        <CreateIssueDialog
          organizationId={organizationId}
          pending={pending}
          onCreate={onCreate}
        />
      </div>
    </div>

    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <InputGroup className="md:max-w-md">
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={searchDraft}
          onChange={onSearchChange}
          placeholder="Search issues"
          aria-label="Search issues"
        />
      </InputGroup>
      <IssueStatusControl
        value={searchState.status}
        includeAll
        className="w-full md:w-44"
        ariaLabel="Filter issues by status"
        onValueChange={onStatusChange}
      />
      <IssuePriorityControl
        value={searchState.priority}
        includeAll
        className="w-full md:w-44"
        ariaLabel="Filter issues by priority"
        onValueChange={onPriorityChange}
      />
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <InputGroup>
        <InputGroupInput
          value={labelDraft}
          onChange={onLabelChange}
          placeholder="Filter by label"
          aria-label="Filter issues by label"
        />
      </InputGroup>
      <IssueAssigneeControl
        value={searchState.assignee || null}
        assignees={assignees}
        includeAll
        className="w-full"
        ariaLabel="Filter issues by assignee"
        onValueChange={onAssigneeChange}
      />
      <Select
        items={tableSortOptions}
        value={searchState.sort}
        onValueChange={onSortChange}
      >
        <SelectTrigger className="w-full" aria-label="Sort issues">
          Sort:{" "}
          {tableSortOptions.find((option) => option.value === searchState.sort)
            ?.label ?? "Updated"}
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {tableSortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        items={tableDirectionOptions}
        value={searchState.dir}
        onValueChange={onDirectionChange}
      >
        <SelectTrigger className="w-full" aria-label="Set issue sort direction">
          {tableDirectionOptions.find(
            (option) => option.value === searchState.dir
          )?.label ?? "Descending"}
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {tableDirectionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  </>
)
