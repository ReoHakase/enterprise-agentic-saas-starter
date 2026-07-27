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
  KeyRoundIcon,
  ListFilterIcon,
  LogInIcon,
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
import {
  OrganizationRoleBadge,
  type OrganizationRole,
} from "@/features/organizations"

import {
  memberTableRoles,
  type MemberTableSearchState,
} from "../../table-search-params"
import { GitHubMark } from "../github-mark"

type LoginMethod = MemberTableSearchState["methods"][number]

const memberRoleOptions = memberTableRoles.map((role) => ({
  value: role,
  label:
    role === "super_admin"
      ? "Super Admin"
      : role === "admin"
        ? "Admin"
        : "Member",
})) satisfies DataTableFilterOption<OrganizationRole>[]
const memberLoginMethodOptions = [
  { value: "github", label: "GitHub" },
  { value: "passkey", label: "Passkey" },
] satisfies DataTableFilterOption<LoginMethod>[]
const memberSortOptions = [
  { value: "user", label: "Member", icon: UserRoundIcon },
  { value: "joined", label: "Joined", icon: CalendarClockIcon },
  { value: "role", label: "Role", icon: ShieldIcon },
] as const
const roleFilterIcon = <ShieldIcon aria-hidden="true" />
const loginMethodFilterIcon = <LogInIcon aria-hidden="true" />

const renderRoleOption = (option: DataTableFilterOption<OrganizationRole>) => (
  <OrganizationRoleBadge role={option.value} />
)

const renderLoginMethodOption = (
  option: DataTableFilterOption<LoginMethod>
) => (
  <span className="inline-flex items-center gap-2">
    <span className="inline-flex size-5 items-center justify-center [&_svg]:size-4">
      {option.value === "github" ? (
        <GitHubMark />
      ) : (
        <KeyRoundIcon aria-hidden="true" />
      )}
    </span>
    {option.label}
  </span>
)

export const MembersTableToolbar = ({
  state,
  filtersActive,
  sortActive,
  onSearchChange,
  onClearSearch,
  onFilterChange,
  onResetFilters,
  onResetSort,
}: {
  state: MemberTableSearchState
  filtersActive: boolean
  sortActive: boolean
  onSearchChange: (value: string) => void
  onClearSearch: () => void
  onFilterChange: (patch: Partial<MemberTableSearchState>) => void
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
      if (value === "user" || value === "joined" || value === "role") {
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
    (roles: OrganizationRole[]) => onFilterChange({ roles }),
    [onFilterChange]
  )
  const changeMethods = useCallback(
    (methods: LoginMethod[]) => onFilterChange({ methods }),
    [onFilterChange]
  )

  return (
    <DataTableToolbar role="toolbar" aria-label="Member table controls">
      <DataTableToolbarRow data-toolbar-row="search">
        <InputGroup className="w-full sm:max-w-sm">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            className="[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none"
            value={state.q}
            placeholder="Search members"
            aria-label="Search members by name or email"
            onChange={changeSearch}
          />
          {state.q ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear member search"
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
          aria-label="Member filters"
          className="w-fit max-w-full gap-1.5 p-1.5"
        >
          <DataTableToolbarLabel>
            <ListFilterIcon aria-hidden="true" />
            Filters
          </DataTableToolbarLabel>
          <DataTableFacetedFilter
            label="Role"
            icon={roleFilterIcon}
            options={memberRoleOptions}
            values={state.roles}
            onValuesChange={changeRoles}
            renderOption={renderRoleOption}
          />
          <DataTableFacetedFilter
            label="Login method"
            icon={loginMethodFilterIcon}
            options={memberLoginMethodOptions}
            values={state.methods}
            onValuesChange={changeMethods}
            renderOption={renderLoginMethodOption}
          />
          <DataTableToolbarGroupActions>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reset member filters"
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
          aria-label="Member sorting"
          className="w-fit max-w-full gap-1.5 p-1.5"
        >
          <DataTableToolbarLabel>
            <ArrowUpDownIcon aria-hidden="true" />
            Sort
          </DataTableToolbarLabel>
          <Select value={state.sort} onValueChange={changeSort}>
            <SelectTrigger size="sm" aria-label="Sort members by">
              <MemberSortLabel sort={state.sort} />
            </SelectTrigger>
            <SelectContent align="start">
              {memberSortOptions.map((option) => {
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
            <SelectTrigger size="sm" aria-label="Member sort direction">
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
              aria-label="Reset member sort"
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

const MemberSortLabel = ({
  sort,
}: {
  sort: MemberTableSearchState["sort"]
}) => {
  const option =
    memberSortOptions.find((candidate) => candidate.value === sort) ??
    memberSortOptions[0]
  const Icon = option.icon

  return (
    <>
      <Icon aria-hidden="true" />
      {option.label}
    </>
  )
}
