"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
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
  type Table as TableInstance,
} from "@tanstack/react-table"
import { MailPlusIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useMemo } from "react"

import {
  DataTableBody,
  DataTableHeader,
  DataTableRoot,
} from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { toDataTablePageSize } from "@/components/data-table/data-table-state"

import type { OrganizationInvitation } from "../../schema"
import {
  useInvitationTableSearchState,
  useTableSearchDraft,
  type InvitationTableSearchState,
} from "../../table-search-params"
import {
  InvitationMutationContext,
  type InvitationMutationState,
} from "./invitation-actions"
import {
  countMatchingInvitations,
  useInvitationTableColumns,
} from "./invitation-table-columns"
import { InvitationsTableToolbar } from "./invitations-table-toolbar"

const getInvitationRowId = (invitation: OrganizationInvitation) => invitation.id

export const InvitationsSection = ({
  organizationName,
  invitations,
  pending,
  error,
  canCancel,
  canResend,
  canResendAdmins,
  mutationPending,
  busyInvitationId,
  onCancel,
  onResend,
  onRetry,
}: {
  organizationName: string
  invitations: OrganizationInvitation[]
  pending: boolean
  error?: string
  canCancel: boolean
  canResend: boolean
  canResendAdmins: boolean
  mutationPending: boolean
  busyInvitationId?: string
  onCancel: (invitationId: string) => void
  onResend: (invitation: OrganizationInvitation) => void
  onRetry?: () => void
}) => {
  const { state, setSearch, setDiscrete } = useInvitationTableSearchState()
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
    const matchingCount = countMatchingInvitations(invitations, {
      query: searchDraft,
      roles: state.roles,
      statuses: state.statuses,
    })
    const lastPageIndex = Math.max(Math.ceil(matchingCount / pageSize) - 1, 0)

    return {
      pageIndex:
        searchDraft === state.q ? Math.min(state.page - 1, lastPageIndex) : 0,
      pageSize,
    }
  }, [
    invitations,
    searchDraft,
    state.page,
    state.pageSize,
    state.q,
    state.roles,
    state.statuses,
  ])
  const columnFilters = useMemo<ColumnFiltersState>(
    () => [
      ...(searchDraft ? [{ id: "email", value: searchDraft }] : []),
      ...(state.roles.length > 0 ? [{ id: "role", value: state.roles }] : []),
      ...(state.statuses.length > 0
        ? [{ id: "status", value: state.statuses }]
        : []),
    ],
    [searchDraft, state.roles, state.statuses]
  )
  const mutationState = useMemo<InvitationMutationState>(
    () => ({ busyInvitationId, pending: mutationPending }),
    [busyInvitationId, mutationPending]
  )
  const activeRecipientEmails = useMemo(
    () =>
      new Set(
        invitations
          .filter((invitation) => invitation.status === "pending")
          .map((invitation) => invitation.email.toLowerCase())
      ),
    [invitations]
  )
  const columns = useInvitationTableColumns({
    activeRecipientEmails,
    canCancel,
    canResend,
    canResendAdmins,
    onCancel,
    onResend,
  })
  const handleSortingChange = useCallback(
    (updater: Parameters<typeof functionalUpdate<SortingState>>[0]) => {
      const next = functionalUpdate(updater, sorting)[0]
      if (!next) {
        void setDiscrete({ sort: "created", dir: "desc", page: 1 })
        return
      }
      if (
        next.id === "email" ||
        next.id === "role" ||
        next.id === "status" ||
        next.id === "created" ||
        next.id === "expires" ||
        next.id === "inviter"
      ) {
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
      void setDiscrete({
        page: next.pageIndex + 1,
        pageSize,
      })
    },
    [pagination, setDiscrete]
  )
  const table = useReactTable({
    data: invitations,
    columns,
    state: { columnFilters, pagination, sorting },
    onPaginationChange: handlePaginationChange,
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getInvitationRowId,
    autoResetPageIndex: false,
    enableSortingRemoval: false,
  })
  const filtersActive = state.roles.length > 0 || state.statuses.length > 0
  const sortActive = state.sort !== "created" || state.dir !== "desc"
  const changeView = useCallback(
    (patch: Partial<InvitationTableSearchState>) => {
      void setDiscrete({ ...patch, page: 1 })
    },
    [setDiscrete]
  )
  const resetFilters = useCallback(() => {
    void setDiscrete({ roles: [], statuses: [], page: 1 })
  }, [setDiscrete])
  const resetSort = useCallback(() => {
    void setDiscrete({ sort: "created", dir: "desc", page: 1 })
  }, [setDiscrete])
  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-labelledby="invitation-list-heading"
    >
      <div>
        <h2 id="invitation-list-heading" className="font-medium">
          Invitations
        </h2>
        <p className="text-sm text-muted-foreground">
          Review recipients, delivery windows, and who invited each person.
        </p>
      </div>

      {pending ? (
        <div
          className="flex min-h-28 items-center justify-center gap-2 rounded-2xl border text-sm text-muted-foreground"
          role="status"
        >
          <Spinner /> Loading invitations
        </div>
      ) : error ? (
        <Empty className="border" role="alert">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MailPlusIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Invitations could not be loaded</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
            {onRetry ? (
              <Button variant="outline" onClick={onRetry}>
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                Try again
              </Button>
            ) : null}
          </EmptyHeader>
        </Empty>
      ) : invitations.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MailPlusIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No invitations</EmptyTitle>
            <EmptyDescription>
              New invitations and their delivery status will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <InvitationsTableToolbar
            state={toolbarState}
            filtersActive={filtersActive}
            sortActive={sortActive}
            onSearchChange={updateSearch}
            onClearSearch={clearSearch}
            onFilterChange={changeView}
            onResetFilters={resetFilters}
            onResetSort={resetSort}
          />
          <InvitationTable
            organizationName={organizationName}
            mutationState={mutationState}
            table={table}
            filtered={Boolean(searchDraft || filtersActive)}
          />
          <DataTablePagination table={table} label="Invitations" />
        </>
      )}
    </section>
  )
}

const InvitationTable = ({
  organizationName,
  mutationState,
  table,
  filtered,
}: {
  organizationName: string
  mutationState: InvitationMutationState
  table: TableInstance<OrganizationInvitation>
  filtered: boolean
}) => (
  <InvitationMutationContext.Provider value={mutationState}>
    <DataTableRoot
      className="max-w-full rounded-2xl"
      tableClassName="min-w-272"
      scrollLabel={`Invitations for ${organizationName}`}
    >
      <TableCaption className="sr-only">
        Invitations for {organizationName}
      </TableCaption>
      <DataTableHeader table={table} />
      <DataTableBody table={table}>
        <EmptyInvitationsState filtered={filtered} />
      </DataTableBody>
    </DataTableRoot>
  </InvitationMutationContext.Provider>
)

const EmptyInvitationsState = ({ filtered }: { filtered: boolean }) => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <MailPlusIcon aria-hidden="true" />
      </EmptyMedia>
      <EmptyTitle>
        {filtered ? "No matching invitations" : "No invitations"}
      </EmptyTitle>
      <EmptyDescription>
        {filtered
          ? "Try a different recipient, inviter, role, or status."
          : "New invitations and their delivery status will appear here."}
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
)
