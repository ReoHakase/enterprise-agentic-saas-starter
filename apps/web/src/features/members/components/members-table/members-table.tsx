"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@enterprise-agentic-saas/ui/components/input-group"
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
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type FilterFn,
  type SortingFn,
  type SortingState,
} from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  EllipsisIcon,
  KeyRoundIcon,
  SearchIcon,
  Trash2Icon,
  UsersRoundIcon,
} from "lucide-react"
import {
  useCallback,
  useContext,
  useMemo,
  useState,
  type ChangeEvent,
} from "react"

import { LocalDate } from "@/components/local-date/local-date"
import { UserIdentity } from "@/components/user-identity/user-identity"
import { type OrganizationRole } from "@/features/organizations"

import type { OrganizationMember } from "../../schema"
import { MemberRoleSelect } from "./member-role-select"
import { MemberMutationContext } from "./members-table-context"

const memberActionsTrigger = <Button variant="ghost" size="icon-sm" />

const getMemberRowId = (member: OrganizationMember) => member.id
const memberRoleOrder: Record<OrganizationRole, number> = {
  super_admin: 0,
  admin: 1,
  member: 2,
}
const memberInitialSorting: SortingState = [{ id: "user", desc: false }]

const memberSearchFilter: FilterFn<OrganizationMember> = (
  row,
  _columnId,
  value
) => {
  const query =
    typeof value === "string" ? value.trim().toLocaleLowerCase() : ""
  if (!query) return true

  return `${row.original.name}\n${row.original.email}`
    .toLocaleLowerCase()
    .includes(query)
}

const memberRoleSorting: SortingFn<OrganizationMember> = (first, second) =>
  memberRoleOrder[first.original.role] - memberRoleOrder[second.original.role]

const memberJoinedSorting: SortingFn<OrganizationMember> = (first, second) =>
  Date.parse(first.original.createdAt) - Date.parse(second.original.createdAt)

const SortableMemberHeader = ({
  column,
  label,
}: {
  column: Column<OrganizationMember, unknown>
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

export const MembersTable = ({
  organizationName,
  organizationRole,
  members,
  pending,
  canManageMembers,
  canManageRoles,
  canTransferSuperAdmin,
  onChangeRole,
  onRequestRemove,
}: {
  organizationName: string
  organizationRole: OrganizationRole
  members: OrganizationMember[]
  pending: boolean
  canManageMembers: boolean
  canManageRoles: boolean
  canTransferSuperAdmin: boolean
  onChangeRole: (member: OrganizationMember, role: OrganizationRole) => void
  onRequestRemove: (member: OrganizationMember) => void
}) => {
  const [search, setSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>(memberInitialSorting)
  const superAdminCount = useMemo(
    () => members.filter((member) => member.role === "super_admin").length,
    [members]
  )
  const isOnlySuperAdmin = useCallback(
    (member: OrganizationMember) =>
      member.role === "super_admin" && superAdminCount <= 1,
    [superAdminCount]
  )
  const canSelectRole = useCallback(
    (member: OrganizationMember, nextRole: OrganizationRole) => {
      if (!canManageRoles) {
        return nextRole === member.role
      }
      if (nextRole === "super_admin" && !canTransferSuperAdmin) {
        return false
      }
      return !(isOnlySuperAdmin(member) && nextRole !== "super_admin")
    },
    [canManageRoles, canTransferSuperAdmin, isOnlySuperAdmin]
  )
  const columns = useMemo<ColumnDef<OrganizationMember>[]>(
    () => [
      {
        id: "user",
        accessorFn: (member) => member.name,
        filterFn: memberSearchFilter,
        header: ({ column }) => (
          <SortableMemberHeader column={column} label="Member" />
        ),
        cell: ({ row }) => <UserIdentity user={row.original} />,
      },
      {
        id: "github",
        header: "GitHub",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.githubLinked ? (
            <LinkedLoginMethod memberName={row.original.name} method="github" />
          ) : null,
      },
      {
        id: "passkey",
        header: "Passkey",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.passkeyLinked ? (
            <LinkedLoginMethod
              memberName={row.original.name}
              method="passkey"
            />
          ) : null,
      },
      {
        id: "joined",
        accessorFn: (member) => member.createdAt,
        sortingFn: memberJoinedSorting,
        header: ({ column }) => (
          <SortableMemberHeader column={column} label="Joined" />
        ),
        cell: ({ row }) => <LocalDate value={row.original.createdAt} />,
      },
      {
        accessorKey: "role",
        sortingFn: memberRoleSorting,
        header: ({ column }) => (
          <SortableMemberHeader column={column} label="Role" />
        ),
        cell: ({ row }) => (
          <MemberRoleSelect
            member={row.original}
            canManageRoles={canManageRoles}
            isOnlySuperAdmin={isOnlySuperAdmin(row.original)}
            canSelectRole={canSelectRole}
            onChange={onChangeRole}
          />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) =>
          canManageMembers ? (
            <MemberActions
              member={row.original}
              organizationRole={organizationRole}
              onRequestRemove={onRequestRemove}
            />
          ) : null,
      },
    ],
    [
      canManageMembers,
      canManageRoles,
      canSelectRole,
      isOnlySuperAdmin,
      onChangeRole,
      onRequestRemove,
      organizationRole,
    ]
  )
  const table = useReactTable({
    data: members,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getMemberRowId,
  })
  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setSearch(value)
      table.getColumn("user")?.setFilterValue(value)
    },
    [table]
  )
  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="sm:max-w-sm">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={search}
            placeholder="Search members"
            aria-label="Search members by name or email"
            onChange={handleSearchChange}
          />
        </InputGroup>
        <p className="text-sm text-muted-foreground" role="status">
          {search ? `${filteredCount} of ${members.length}` : members.length}{" "}
          {members.length === 1 ? "member" : "members"}
        </p>
      </div>
      <div className="max-w-full min-w-0 rounded-2xl border">
        <MemberMutationContext.Provider value={pending}>
          <Table scrollLabel={`Members of ${organizationName}`}>
            <TableCaption className="sr-only">
              Members of {organizationName}
            </TableCaption>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={memberColumnClass(header.column.id)}
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
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={memberColumnClass(cell.column.id)}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <EmptyMembersRow
                  columnCount={columns.length}
                  filtered={Boolean(search)}
                />
              )}
            </TableBody>
          </Table>
        </MemberMutationContext.Provider>
      </div>
    </div>
  )
}

const EmptyMembersRow = ({
  columnCount,
  filtered,
}: {
  columnCount: number
  filtered: boolean
}) => (
  <TableRow>
    <TableCell colSpan={columnCount}>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRoundIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No matching members" : "No members"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try a different name or email address."
              : "Invite the first member to this organization."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </TableCell>
  </TableRow>
)

const memberColumnClass = (columnId: string) => {
  if (columnId === "user") {
    return "min-w-56"
  }
  if (columnId === "role") {
    return "w-44 min-w-44"
  }
  if (columnId === "github" || columnId === "passkey") {
    return "w-24 min-w-24 text-center"
  }
  if (columnId === "joined") {
    return "w-40 min-w-40"
  }
  if (columnId === "actions") {
    return "w-14 text-right"
  }
  return undefined
}

const LinkedLoginMethod = ({
  memberName,
  method,
}: {
  memberName: string
  method: "github" | "passkey"
}) => {
  const label =
    method === "github"
      ? `${memberName} has GitHub linked`
      : `${memberName} has a passkey linked`

  return (
    <span
      className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-foreground [&_svg]:size-4"
      role="img"
      aria-label={label}
      title={label}
    >
      {method === "github" ? (
        <GitHubMark />
      ) : (
        <KeyRoundIcon aria-hidden="true" />
      )}
    </span>
  )
}

const GitHubMark = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.82a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
  </svg>
)

const MemberActions = ({
  member,
  organizationRole,
  onRequestRemove,
}: {
  member: OrganizationMember
  organizationRole: OrganizationRole
  onRequestRemove: (member: OrganizationMember) => void
}) => {
  const pending = useContext(MemberMutationContext)
  const permanentlyDisabled =
    member.role === "super_admin" ||
    (organizationRole === "admin" && member.role !== "member")
  const requestRemoval = useCallback(() => {
    if (!pending && !permanentlyDisabled) onRequestRemove(member)
  }, [member, onRequestRemove, pending, permanentlyDisabled])

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={memberActionsTrigger}
          aria-disabled={pending || undefined}
          aria-label={`More actions for ${member.name}`}
          aria-busy={pending}
        >
          <EllipsisIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Member actions</DropdownMenuLabel>
            <DropdownMenuItem
              variant="destructive"
              disabled={permanentlyDisabled || pending}
              title={
                member.role === "super_admin"
                  ? "Transfer Super Admin before removing this member."
                  : undefined
              }
              onClick={requestRemoval}
            >
              <Trash2Icon aria-hidden="true" />
              Remove member
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
