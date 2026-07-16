"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type SortingFn,
  type SortingState,
  type Table as TableInstance,
} from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  MailPlusIcon,
  RefreshCwIcon,
} from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type MouseEvent,
} from "react"

import { LocalDate } from "@/components/local-date"
import { UserIdentity } from "@/components/user-identity"
import type {
  OrganizationInvitation,
  OrganizationInvitationStatus,
} from "@/features/members/schema"
import { roleLabel } from "@/features/organizations/schema"

const cancelInvitationTrigger = (
  <Button variant="ghost" size="xs">
    Cancel
  </Button>
)
const invitationRoleOrder = { admin: 0, member: 1 } as const
const invitationStatusOrder: Record<OrganizationInvitationStatus, number> = {
  pending: 0,
  expired: 1,
  accepted: 2,
  rejected: 3,
  canceled: 4,
}
const invitationInitialSorting: SortingState = [{ id: "created", desc: true }]

type InvitationMutationState = {
  busyInvitationId?: string
  pending: boolean
}

const idleInvitationMutationState: InvitationMutationState = { pending: false }
const InvitationMutationContext = createContext<InvitationMutationState>(
  idleInvitationMutationState
)

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
const getInvitationRowId = (invitation: OrganizationInvitation) => invitation.id

const invitationStatusLabel = (status: OrganizationInvitationStatus) =>
  status.charAt(0).toUpperCase() + status.slice(1)

const invitationStatusVariant = (
  status: OrganizationInvitationStatus
): "outline" | "secondary" => {
  if (status === "pending") return "secondary"
  return "outline"
}

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
  const [sorting, setSorting] = useState<SortingState>(invitationInitialSorting)
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
  const columns = useMemo<ColumnDef<OrganizationInvitation>[]>(
    () => [
      {
        accessorKey: "email",
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Recipient" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.email}</span>
        ),
      },
      {
        accessorKey: "role",
        sortingFn: invitationRoleSorting,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Role" />
        ),
        cell: ({ row }) => (
          <Badge variant="outline">{roleLabel(row.original.role)}</Badge>
        ),
      },
      {
        accessorKey: "status",
        sortingFn: invitationStatusSorting,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Status" />
        ),
        cell: ({ row }) => (
          <Badge variant={invitationStatusVariant(row.original.status)}>
            {invitationStatusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        id: "created",
        accessorFn: (invitation) => invitation.createdAt,
        sortingFn: invitationCreatedSorting,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Created" />
        ),
        cell: ({ row }) => <LocalDate value={row.original.createdAt} />,
      },
      {
        id: "expires",
        accessorFn: (invitation) => invitation.expiresAt,
        sortingFn: invitationExpiresSorting,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Expires" />
        ),
        cell: ({ row }) => <LocalDate value={row.original.expiresAt} />,
      },
      {
        id: "inviter",
        accessorFn: (invitation) => invitation.inviter.name,
        header: ({ column }) => (
          <SortableInvitationHeader column={column} label="Inviter" />
        ),
        cell: ({ row }) => <UserIdentity user={row.original.inviter} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
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
  const table = useReactTable({
    data: invitations,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getInvitationRowId,
  })

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
        <InvitationTable
          organizationName={organizationName}
          mutationState={mutationState}
          table={table}
        />
      )}
    </section>
  )
}

const InvitationTable = ({
  organizationName,
  mutationState,
  table,
}: {
  organizationName: string
  mutationState: InvitationMutationState
  table: TableInstance<OrganizationInvitation>
}) => (
  <div className="max-w-full min-w-0 rounded-2xl border">
    <InvitationMutationContext.Provider value={mutationState}>
      <Table
        className="min-w-272"
        scrollLabel={`Invitations for ${organizationName}`}
      >
        <TableCaption className="sr-only">
          Invitations for {organizationName}
        </TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={invitationColumnClass(header.column.id)}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={invitationColumnClass(cell.column.id)}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </InvitationMutationContext.Provider>
  </div>
)

const invitationColumnClass = (columnId: string) => {
  if (columnId === "email") return "min-w-56"
  if (columnId === "role" || columnId === "status") return "min-w-28"
  if (columnId === "created" || columnId === "expires") return "min-w-36"
  if (columnId === "inviter") return "min-w-56"
  if (columnId === "actions") return "min-w-52 text-right"
  return undefined
}

const InvitationActions = ({
  invitation,
  activeInvitationExists,
  canCancel,
  canResend,
  canResendAdmins,
  onCancel,
  onResend,
}: {
  invitation: OrganizationInvitation
  activeInvitationExists: boolean
  canCancel: boolean
  canResend: boolean
  canResendAdmins: boolean
  onCancel: (invitationId: string) => void
  onResend: (invitation: OrganizationInvitation) => void
}) => {
  const mutation = useContext(InvitationMutationContext)
  const blocked = mutation.pending
  const busy = mutation.busyInvitationId === invitation.id
  const resendable =
    (invitation.status === "pending" || invitation.status === "expired") &&
    !activeInvitationExists &&
    canResend &&
    (invitation.role !== "admin" || canResendAdmins)
  const cancelable = canCancel && invitation.status === "pending"
  const resend = useCallback(() => {
    if (!blocked && resendable) onResend(invitation)
  }, [blocked, invitation, onResend, resendable])
  const cancel = useCallback(() => {
    if (!blocked && cancelable) onCancel(invitation.id)
  }, [blocked, cancelable, invitation.id, onCancel])
  const preventBlockedTrigger = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!blocked) return
      event.preventDefault()
      event.stopPropagation()
    },
    [blocked]
  )

  if (!resendable && !cancelable) {
    return activeInvitationExists && canResend ? (
      <span className="text-xs text-muted-foreground">
        Active invitation exists
      </span>
    ) : null
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {resendable ? (
        <Button
          variant="outline"
          size="xs"
          aria-disabled={blocked || undefined}
          aria-busy={busy}
          onClick={resend}
        >
          {busy ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {invitation.status === "expired" ? "Renew & resend" : "Resend"}
        </Button>
      ) : null}
      {cancelable ? (
        <AlertDialog>
          <AlertDialogTrigger
            render={cancelInvitationTrigger}
            aria-disabled={blocked || undefined}
            onClick={preventBlockedTrigger}
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <MailPlusIcon aria-hidden="true" />
              </AlertDialogMedia>
              <AlertDialogTitle>Cancel this invitation?</AlertDialogTitle>
              <AlertDialogDescription>
                {invitation.email} will no longer be able to join with this
                invitation.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep invitation</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={cancel}>
                Cancel invitation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}
