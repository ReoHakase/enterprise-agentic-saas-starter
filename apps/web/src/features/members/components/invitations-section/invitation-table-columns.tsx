import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  type Column,
  type ColumnDef,
  type FilterFn,
  type SortingFn,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon } from "lucide-react"
import { useCallback, useMemo } from "react"

import { LocalDate } from "@/components/local-date/local-date"
import { UserIdentity } from "@/components/user-identity/user-identity"
import { OrganizationRoleBadge } from "@/features/organizations"

import type {
  OrganizationInvitation,
  OrganizationInvitationStatus,
} from "../../schema"
import { InvitationStatusBadge } from "../invitation-status-badge/invitation-status-badge"
import { InvitationActions } from "./invitation-actions"

const invitationRoleOrder = { admin: 0, member: 1 } as const
const invitationStatusOrder: Record<OrganizationInvitationStatus, number> = {
  pending: 0,
  expired: 1,
  accepted: 2,
  rejected: 3,
  canceled: 4,
}

const invitationRoleSorting: SortingFn<OrganizationInvitation> = (
  first,
  second
) =>
  invitationRoleOrder[first.original.role] -
  invitationRoleOrder[second.original.role]

const invitationStatusSorting: SortingFn<OrganizationInvitation> = (
  first,
  second
) =>
  invitationStatusOrder[first.original.status] -
  invitationStatusOrder[second.original.status]

const invitationDateSorting =
  (field: "createdAt" | "expiresAt"): SortingFn<OrganizationInvitation> =>
  (first, second) =>
    Date.parse(first.original[field]) - Date.parse(second.original[field])

const invitationCreatedSorting = invitationDateSorting("createdAt")
const invitationExpiresSorting = invitationDateSorting("expiresAt")

const invitationMatchesSearch = (
  invitation: OrganizationInvitation,
  value: unknown
) => {
  const query =
    typeof value === "string" ? value.trim().toLocaleLowerCase() : ""
  if (!query) return true

  return [
    invitation.email,
    invitation.inviter.name,
    invitation.inviter.email,
  ].some((candidate) => candidate.toLocaleLowerCase().includes(query))
}

const invitationSearchFilter: FilterFn<OrganizationInvitation> = (
  row,
  _columnId,
  value
) => invitationMatchesSearch(row.original, value)

const invitationMatchesRole = (
  invitation: OrganizationInvitation,
  value: unknown
) => {
  const roles = Array.isArray(value) ? value : []
  return roles.length === 0 || roles.includes(invitation.role)
}

const invitationRoleFilter: FilterFn<OrganizationInvitation> = (
  row,
  _columnId,
  value
) => invitationMatchesRole(row.original, value)

const invitationMatchesStatus = (
  invitation: OrganizationInvitation,
  value: unknown
) => {
  const statuses = Array.isArray(value) ? value : []
  return statuses.length === 0 || statuses.includes(invitation.status)
}

const invitationStatusFilter: FilterFn<OrganizationInvitation> = (
  row,
  _columnId,
  value
) => invitationMatchesStatus(row.original, value)

export const countMatchingInvitations = (
  invitations: OrganizationInvitation[],
  {
    query,
    roles,
    statuses,
  }: {
    query: string
    roles: readonly OrganizationInvitation["role"][]
    statuses: readonly OrganizationInvitationStatus[]
  }
) =>
  invitations.filter(
    (invitation) =>
      invitationMatchesSearch(invitation, query) &&
      invitationMatchesRole(invitation, roles) &&
      invitationMatchesStatus(invitation, statuses)
  ).length

const SortableInvitationHeader = ({
  column,
  label,
}: {
  column: Column<OrganizationInvitation, unknown>
  label: string
}) => {
  const sorting = column.getIsSorted()
  const sort = useCallback(
    () => column.toggleSorting(sorting === "asc"),
    [column, sorting]
  )
  const currentSort =
    sorting === "asc"
      ? ", currently ascending"
      : sorting === "desc"
        ? ", currently descending"
        : ""

  return (
    <Button
      className="-ml-3"
      variant="ghost"
      size="sm"
      aria-label={`Sort by ${label.toLocaleLowerCase()}${currentSort}`}
      onClick={sort}
    >
      {label}
      {sorting === "desc" ? (
        <ArrowDownIcon data-icon="inline-end" aria-hidden="true" />
      ) : (
        <ArrowUpDownIcon data-icon="inline-end" aria-hidden="true" />
      )}
    </Button>
  )
}

export const useInvitationTableColumns = ({
  activeRecipientEmails,
  canCancel,
  canResend,
  canResendAdmins,
  onCancel,
  onResend,
}: {
  activeRecipientEmails: Set<string>
  canCancel: boolean
  canResend: boolean
  canResendAdmins: boolean
  onCancel: (invitationId: string) => void
  onResend: (invitation: OrganizationInvitation) => void
}) =>
  useMemo<ColumnDef<OrganizationInvitation>[]>(
    () => [
      {
        accessorKey: "email",
        filterFn: invitationSearchFilter,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Recipient" />
        ),
        meta: {
          headerClassName: "min-w-56",
          cellClassName: "min-w-56",
        },
        cell: ({ row }) => (
          <span className="font-medium">{row.original.email}</span>
        ),
      },
      {
        accessorKey: "role",
        filterFn: invitationRoleFilter,
        sortingFn: invitationRoleSorting,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Role" />
        ),
        meta: {
          headerClassName: "min-w-28",
          cellClassName: "min-w-28",
        },
        cell: ({ row }) => <OrganizationRoleBadge role={row.original.role} />,
      },
      {
        accessorKey: "status",
        filterFn: invitationStatusFilter,
        sortingFn: invitationStatusSorting,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Status" />
        ),
        meta: {
          headerClassName: "min-w-28",
          cellClassName: "min-w-28",
        },
        cell: ({ row }) => (
          <InvitationStatusBadge status={row.original.status} />
        ),
      },
      {
        id: "created",
        accessorFn: (invitation) => invitation.createdAt,
        sortingFn: invitationCreatedSorting,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Created" />
        ),
        meta: {
          headerClassName: "min-w-36",
          cellClassName: "min-w-36",
        },
        cell: ({ row }) => <LocalDate value={row.original.createdAt} />,
      },
      {
        id: "expires",
        accessorFn: (invitation) => invitation.expiresAt,
        sortingFn: invitationExpiresSorting,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Expires" />
        ),
        meta: {
          headerClassName: "min-w-36",
          cellClassName: "min-w-36",
        },
        cell: ({ row }) => <LocalDate value={row.original.expiresAt} />,
      },
      {
        id: "inviter",
        accessorFn: (invitation) => invitation.inviter.name,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Inviter" />
        ),
        meta: {
          headerClassName: "min-w-56",
          cellClassName: "min-w-56",
        },
        cell: ({ row }) => <UserIdentity user={row.original.inviter} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: {
          headerClassName: "min-w-52 text-right",
          cellClassName: "min-w-52 text-right",
        },
        cell: ({ row }) => (
          <InvitationActions
            invitation={row.original}
            activeInvitationExists={
              row.original.status === "expired" &&
              activeRecipientEmails.has(row.original.email.toLowerCase())
            }
            canCancel={canCancel}
            canResend={canResend}
            canResendAdmins={canResendAdmins}
            onCancel={onCancel}
            onResend={onResend}
          />
        ),
      },
    ],
    [
      activeRecipientEmails,
      canCancel,
      canResend,
      canResendAdmins,
      onCancel,
      onResend,
    ]
  )
