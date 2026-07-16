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
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { Trash2Icon, UsersRoundIcon } from "lucide-react"
import { createContext, useCallback, useContext, useMemo } from "react"

import { UserIdentity } from "@/components/user-identity"
import type { OrganizationMember } from "@/features/members/schema"
import {
  roleLabel,
  type OrganizationRole,
} from "@/features/organizations/schema"

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
        accessorKey: "name",
        header: "User",
        cell: ({ row }) => <UserIdentity user={row.original} />,
      },
      {
        accessorKey: "role",
        header: "Role",
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
    getCoreRowModel: getCoreRowModel(),
    getRowId: getMemberRowId,
  })

  return (
    <div className="max-w-full min-w-0 overflow-hidden rounded-2xl border">
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
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <UsersRoundIcon aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>No members</EmptyTitle>
                      <EmptyDescription>
                        Invite the first member to this organization.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </MemberMutationContext.Provider>
    </div>
  )
}

const memberColumnClass = (columnId: string) => {
  if (columnId === "name") {
    return "min-w-56"
  }
  if (columnId === "role") {
    return "w-44 min-w-44"
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
  const disabled =
    pending ||
    member.role === "super_admin" ||
    (organizationRole === "admin" && member.role !== "member")
  const requestRemoval = useCallback(
    () => onRequestRemove(member),
    [member, onRequestRemove]
  )

  return (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
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
