"use client"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { TableCaption } from "@enterprise-agentic-saas/ui/components/table"
import {
  functionalUpdate,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table"
import { UsersRoundIcon } from "lucide-react"
import { useCallback, useMemo } from "react"

import {
  DataTableBody,
  DataTableHeader,
  DataTableRoot,
} from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { toDataTablePageSize } from "@/components/data-table/data-table-state"
import type { OrganizationRole } from "@/features/organizations"

import type { OrganizationMember } from "../../schema"
import {
  useMemberTableSearchState,
  useTableSearchDraft,
  type MemberTableSearchState,
} from "../../table-search-params"
import {
  countMatchingMembers,
  useMemberTableColumns,
} from "./member-table-columns"
import { MemberMutationContext } from "./members-table-context"
import { MembersTableToolbar } from "./members-table-toolbar"

const getMemberRowId = (member: OrganizationMember) => member.id

export const MembersTable = ({
  organizationName,
  organizationRole,
  members,
  pending,
  canManageMembers,
  canManageRoles,
  canTransferOwnership,
  onChangeRole,
  onRequestRemove,
}: {
  organizationName: string
  organizationRole: OrganizationRole
  members: OrganizationMember[]
  pending: boolean
  canManageMembers: boolean
  canManageRoles: boolean
  canTransferOwnership: boolean
  onChangeRole: (member: OrganizationMember, role: OrganizationRole) => void
  onRequestRemove: (member: OrganizationMember) => void
}) => {
  const { state, setSearch, setDiscrete } = useMemberTableSearchState()
  const {
    clearDraft: clearSearch,
    draft: searchDraft,
    updateDraft: updateSearch,
  } = useTableSearchDraft(state.q, setSearch)
  const toolbarState = useMemo(
    () => ({ ...state, q: searchDraft }),
    [searchDraft, state]
  )
  const sorting = useMemo<SortingState>(
    () => [{ id: state.sort, desc: state.dir === "desc" }],
    [state.dir, state.sort]
  )
  const pagination = useMemo<PaginationState>(() => {
    const pageSize = Number(state.pageSize)
    const matchingCount = countMatchingMembers(members, {
      query: searchDraft,
      roles: state.roles,
      methods: state.methods,
    })
    const lastPageIndex = Math.max(Math.ceil(matchingCount / pageSize) - 1, 0)

    return {
      pageIndex:
        searchDraft === state.q ? Math.min(state.page - 1, lastPageIndex) : 0,
      pageSize,
    }
  }, [
    members,
    searchDraft,
    state.methods,
    state.page,
    state.pageSize,
    state.q,
    state.roles,
  ])
  const columnFilters = useMemo<ColumnFiltersState>(
    () => [
      ...(searchDraft ? [{ id: "user", value: searchDraft }] : []),
      ...(state.roles.length > 0 ? [{ id: "role", value: state.roles }] : []),
      ...(state.methods.length > 0
        ? [{ id: "github", value: state.methods }]
        : []),
    ],
    [searchDraft, state.methods, state.roles]
  )
  const columns = useMemberTableColumns({
    organizationRole,
    members,
    canManageMembers,
    canManageRoles,
    canTransferOwnership,
    onChangeRole,
    onRequestRemove,
  })
  const handleSortingChange = useCallback(
    (updater: Parameters<typeof functionalUpdate<SortingState>>[0]) => {
      const next = functionalUpdate(updater, sorting)[0]
      if (!next) {
        void setDiscrete({ sort: "user", dir: "asc", page: 1 })
        return
      }
      if (next.id === "user" || next.id === "joined" || next.id === "role") {
        void setDiscrete({
          sort: next.id,
          dir: next.desc ? "desc" : "asc",
          page: 1,
        })
      }
    },
    [setDiscrete, sorting]
  )
  const handlePaginationChange = useCallback(
    (updater: Parameters<typeof functionalUpdate<PaginationState>>[0]) => {
      const next = functionalUpdate(updater, pagination)
      const pageSize = toDataTablePageSize(next.pageSize)
      if (!pageSize) return
      void setDiscrete({ page: next.pageIndex + 1, pageSize })
    },
    [pagination, setDiscrete]
  )
  const table = useReactTable({
    data: members,
    columns,
    state: { columnFilters, pagination, sorting },
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getMemberRowId,
    autoResetPageIndex: false,
    enableSortingRemoval: false,
  })
  const filtersActive = state.roles.length > 0 || state.methods.length > 0
  const sortActive = state.sort !== "user" || state.dir !== "asc"
  const changeView = useCallback(
    (patch: Partial<MemberTableSearchState>) => {
      void setDiscrete({ ...patch, page: 1 })
    },
    [setDiscrete]
  )
  const resetFilters = useCallback(() => {
    void setDiscrete({ roles: [], methods: [], page: 1 })
  }, [setDiscrete])
  const resetSort = useCallback(() => {
    void setDiscrete({ sort: "user", dir: "asc", page: 1 })
  }, [setDiscrete])
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <MembersTableToolbar
        state={toolbarState}
        filtersActive={filtersActive}
        sortActive={sortActive}
        onSearchChange={updateSearch}
        onClearSearch={clearSearch}
        onFilterChange={changeView}
        onResetFilters={resetFilters}
        onResetSort={resetSort}
      />
      <MemberMutationContext.Provider value={pending}>
        <DataTableRoot
          className="max-w-full rounded-2xl"
          scrollLabel={`Members of ${organizationName}`}
        >
          <TableCaption className="sr-only">
            Members of {organizationName}
          </TableCaption>
          <DataTableHeader table={table} />
          <DataTableBody table={table}>
            <EmptyMembersState
              filtered={Boolean(searchDraft || filtersActive)}
            />
          </DataTableBody>
        </DataTableRoot>
      </MemberMutationContext.Provider>
      <DataTablePagination table={table} label="Members" />
    </div>
  )
}

const EmptyMembersState = ({ filtered }: { filtered: boolean }) => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <UsersRoundIcon aria-hidden="true" />
      </EmptyMedia>
      <EmptyTitle>{filtered ? "No matching members" : "No members"}</EmptyTitle>
      <EmptyDescription>
        {filtered
          ? "Try a different name or email address."
          : "Invite the first member to this organization."}
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
)
