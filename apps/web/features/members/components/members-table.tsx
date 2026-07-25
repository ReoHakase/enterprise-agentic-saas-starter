"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
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
  SearchIcon,
  Trash2Icon,
  UsersRoundIcon,
} from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ChangeEvent,
} from "react"

import { LocalDate } from "@/components/local-date"
import { UserIdentity } from "@/components/user-identity"
import { roleLabel, type OrganizationRole } from "@/features/organizations"

import type { OrganizationMember } from "../schema"

const invitationRoleOptions = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
]

const organizationRoleOptions = [
  ...invitationRoleOptions,
  { label: "Super Admin", value: "super_admin" },
]

const isOrganizationRole = (value: string | null): value is OrganizationRole =>
  value === "super_admin" || value === "admin" || value === "member"

const getMemberRowId = (member: OrganizationMember) => member.id
const MemberMutationContext = createContext(false)
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
          <SortableMemberHeader column={column} label="User" />
        ),
        cell: ({ row }) => <UserIdentity user={row.original} />,
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
        id: "joined",
        accessorFn: (member) => member.createdAt,
        sortingFn: memberJoinedSorting,
        header: ({ column }) => (
          <SortableMemberHeader column={column} label="Joined" />
        ),
        cell: ({ row }) => <LocalDate value={row.original.createdAt} />,
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
  if (columnId === "joined") {
    return "w-40 min-w-40"
  }
  if (columnId === "actions") {
    return "w-14 text-right"
  }
  return undefined
}

const MemberRoleSelect = ({
  member,
  canManageRoles,
  isOnlySuperAdmin,
  canSelectRole,
  onChange,
}: {
  member: OrganizationMember
  canManageRoles: boolean
  isOnlySuperAdmin: boolean
  canSelectRole: (member: OrganizationMember, role: OrganizationRole) => boolean
  onChange: (member: OrganizationMember, role: OrganizationRole) => void
}) => {
  const pending = useContext(MemberMutationContext)
  const descriptionId = `member-role-description-${member.id}`
  const disabledReason = !canManageRoles
    ? "Only the Super Admin can change roles."
    : isOnlySuperAdmin
      ? "Transfer Super Admin before changing this role."
      : undefined
  const handleValueChange = useCallback(
    (value: string | null) => {
      if (isOrganizationRole(value)) {
        onChange(member, value)
      }
    },
    [member, onChange]
  )

  return (
    <div>
      <Select
        items={organizationRoleOptions}
        value={member.role}
        disabled={!canManageRoles}
        readOnly={pending}
        onValueChange={handleValueChange}
      >
        <SelectTrigger
          className="w-36"
          aria-label={`Role for ${member.name}`}
          aria-describedby={disabledReason ? descriptionId : undefined}
          aria-busy={pending}
          title={disabledReason}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {roleLabel(member.role)}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem
              value="member"
              disabled={!canSelectRole(member, "member")}
            >
              Member
            </SelectItem>
            <SelectItem
              value="admin"
              disabled={!canSelectRole(member, "admin")}
            >
              Admin
            </SelectItem>
            <SelectItem
              value="super_admin"
              disabled={!canSelectRole(member, "super_admin")}
            >
              Super Admin
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {disabledReason ? (
        <span id={descriptionId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </div>
  )
}

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
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={permanentlyDisabled}
        aria-disabled={pending || undefined}
        aria-busy={pending}
        title={
          member.role === "super_admin"
            ? "Transfer Super Admin before removing this member."
            : `Remove ${member.name}`
        }
        onClick={requestRemoval}
      >
        <Trash2Icon aria-hidden="true" />
        <span className="sr-only">Remove {member.name}</span>
      </Button>
    </div>
  )
}
