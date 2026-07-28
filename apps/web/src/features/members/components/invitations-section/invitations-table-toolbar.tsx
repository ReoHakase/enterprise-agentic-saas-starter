import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@enterprise-agentic-saas/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  CalendarClockIcon,
  CircleDotIcon,
  ListFilterIcon,
  MailPlusIcon,
  SearchIcon,
  ShieldIcon,
  Undo2Icon,
  UserRoundIcon,
  XIcon,
} from "lucide-react"
import { useCallback, type ChangeEvent } from "react"

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
import { OrganizationRoleBadge } from "@/features/organizations"

import type { OrganizationInvitationStatus } from "../../schema"
import {
  invitationTableRoles,
  invitationTableStatuses,
  type InvitationTableSearchState,
} from "../../table-search-params"
import { InvitationStatusBadge } from "../invitation-status-badge/invitation-status-badge"

type InvitationRole = InvitationTableSearchState["roles"][number]

const invitationRoleOptions = invitationTableRoles.map((role) => ({
  value: role,
  label: role === "admin" ? "Admin" : "Member",
})) satisfies DataTableFilterOption<InvitationRole>[]
const invitationStatusLabels: Record<OrganizationInvitationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  canceled: "Canceled",
}
const invitationStatusOptions = invitationTableStatuses.map((status) => ({
  value: status,
  label: invitationStatusLabels[status],
})) satisfies DataTableFilterOption<OrganizationInvitationStatus>[]
const invitationSortOptions = [
  { value: "email", label: "Recipient", icon: MailPlusIcon },
  { value: "role", label: "Role", icon: ShieldIcon },
  { value: "status", label: "Status", icon: CircleDotIcon },
  { value: "created", label: "Created", icon: CalendarClockIcon },
  { value: "expires", label: "Expires", icon: CalendarClockIcon },
  { value: "inviter", label: "Inviter", icon: UserRoundIcon },
] as const
const roleFilterIcon = <ShieldIcon aria-hidden="true" />
const statusFilterIcon = <CircleDotIcon aria-hidden="true" />

const renderRoleOption = (option: DataTableFilterOption<InvitationRole>) => (
  <OrganizationRoleBadge role={option.value} />
)

const renderStatusOption = (
  option: DataTableFilterOption<OrganizationInvitationStatus>
) => <InvitationStatusBadge status={option.value} />

export const InvitationsTableToolbar = ({
  state,
  filtersActive,
  sortActive,
  onSearchChange,
  onClearSearch,
  onFilterChange,
  onResetFilters,
  onResetSort,
}: {
  state: InvitationTableSearchState
  filtersActive: boolean
  sortActive: boolean
  onSearchChange: (value: string) => void
  onClearSearch: () => void
  onFilterChange: (patch: Partial<InvitationTableSearchState>) => void
  onResetFilters: () => void
  onResetSort: () => void
}) => {
  const changeSearch = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSearchChange(event.target.value),
    [onSearchChange]
  )
  const changeSort = useCallback(
    (value: string | null) => {
      if (
        value === "email" ||
        value === "role" ||
        value === "status" ||
        value === "created" ||
        value === "expires" ||
        value === "inviter"
      ) {
        onFilterChange({ sort: value })
      }
    },
    [onFilterChange]
  )
  const changeDirection = useCallback(
    (value: string | null) => {
      if (value === "asc" || value === "desc") {
        onFilterChange({ dir: value })
      }
    },
    [onFilterChange]
  )
  const changeRoles = useCallback(
    (roles: InvitationRole[]) => onFilterChange({ roles }),
    [onFilterChange]
  )
  const changeStatuses = useCallback(
    (statuses: OrganizationInvitationStatus[]) => onFilterChange({ statuses }),
    [onFilterChange]
  )

  return (
    <DataTableToolbar role="toolbar" aria-label="Invitation table controls">
      <DataTableToolbarRow data-toolbar-row="search">
        <InputGroup className="w-full sm:max-w-sm">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            className="[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none"
            value={state.q}
            placeholder="Search invitations"
            aria-label="Search invitations by recipient or inviter"
            onChange={changeSearch}
          />
          {state.q ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear invitation search"
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
          aria-label="Invitation filters"
          className="w-fit max-w-full gap-1.5 p-1.5"
        >
          <DataTableToolbarLabel>
            <ListFilterIcon aria-hidden="true" />
            Filters
          </DataTableToolbarLabel>
          <DataTableFacetedFilter
            label="Invitation role"
            icon={roleFilterIcon}
            options={invitationRoleOptions}
            values={state.roles}
            onValuesChange={changeRoles}
            renderOption={renderRoleOption}
          />
          <DataTableFacetedFilter
            label="Invitation status"
            icon={statusFilterIcon}
            options={invitationStatusOptions}
            values={state.statuses}
            onValuesChange={changeStatuses}
            renderOption={renderStatusOption}
          />
          <DataTableToolbarGroupActions>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reset invitation filters"
              disabled={!filtersActive}
              onClick={onResetFilters}
            >
              <Undo2Icon aria-hidden="true" />
              Reset
            </Button>
          </DataTableToolbarGroupActions>
        </DataTableToolbarGroup>
        <DataTableToolbarGroup
          role="group"
          aria-label="Invitation sorting"
          className="w-fit max-w-full gap-1.5 p-1.5"
        >
          <DataTableToolbarLabel>
            <ArrowUpDownIcon aria-hidden="true" />
            Sort
          </DataTableToolbarLabel>
          <Select value={state.sort} onValueChange={changeSort}>
            <SelectTrigger size="sm" aria-label="Sort invitations by">
              <InvitationSortLabel sort={state.sort} />
            </SelectTrigger>
            <SelectContent align="start">
              {invitationSortOptions.map((option) => {
                const Icon = option.icon
                return (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    label={option.label}
                  >
                    <Icon aria-hidden="true" />
                    {option.label}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <Select value={state.dir} onValueChange={changeDirection}>
            <SelectTrigger size="sm" aria-label="Invitation sort direction">
              {state.dir === "asc" ? (
                <>
                  <ArrowUpIcon aria-hidden="true" />
                  Ascending
                </>
              ) : (
                <>
                  <ArrowDownIcon aria-hidden="true" />
                  Descending
                </>
              )}
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="asc" label="Ascending">
                <ArrowUpIcon aria-hidden="true" />
                Ascending
              </SelectItem>
              <SelectItem value="desc" label="Descending">
                <ArrowDownIcon aria-hidden="true" />
                Descending
              </SelectItem>
            </SelectContent>
          </Select>
          <DataTableToolbarGroupActions>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reset invitation sort"
              disabled={!sortActive}
              onClick={onResetSort}
            >
              <Undo2Icon aria-hidden="true" />
              Reset
            </Button>
          </DataTableToolbarGroupActions>
        </DataTableToolbarGroup>
      </DataTableToolbarRow>
    </DataTableToolbar>
  )
}

const InvitationSortLabel = ({
  sort,
}: {
  sort: InvitationTableSearchState["sort"]
}) => {
  const option =
    invitationSortOptions.find((candidate) => candidate.value === sort) ??
    invitationSortOptions[3]
  const Icon = option.icon

  return (
    <>
      <Icon aria-hidden="true" />
      {option.label}
    </>
  )
}
