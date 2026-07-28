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
  type Column,
  type ColumnDef,
  type FilterFn,
  type SortingFn,
} from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  EllipsisIcon,
  KeyRoundIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useContext, useMemo } from "react"

import { LocalDate } from "@/components/local-date/local-date"
import { UserIdentity } from "@/components/user-identity/user-identity"
import type { OrganizationRole } from "@/features/organizations"

import type { OrganizationMember } from "../../schema"
import { GitHubMark } from "../github-mark"
import { MemberRoleSelect } from "./member-role-select"
import { MemberMutationContext } from "./members-table-context"

const memberActionsTrigger = <Button variant="ghost" size="icon-sm" />
const memberRoleOrder: Record<OrganizationRole, number> = {
  super_admin: 0,
  admin: 1,
  member: 2,
}

const memberMatchesSearch = (member: OrganizationMember, value: unknown) => {
  const query =
    typeof value === "string" ? value.trim().toLocaleLowerCase() : ""
  if (!query) return true

  return `${member.name}\n${member.email}`.toLocaleLowerCase().includes(query)
}

const memberSearchFilter: FilterFn<OrganizationMember> = (
  row,
  _columnId,
  value
) => memberMatchesSearch(row.original, value)

const memberRoleSorting: SortingFn<OrganizationMember> = (first, second) =>
  memberRoleOrder[first.original.role] - memberRoleOrder[second.original.role]

const memberJoinedSorting: SortingFn<OrganizationMember> = (first, second) =>
  Date.parse(first.original.createdAt) - Date.parse(second.original.createdAt)

const memberMatchesRole = (member: OrganizationMember, value: unknown) => {
  const roles = Array.isArray(value) ? value : []
  return roles.length === 0 || roles.includes(member.role)
}

const memberRoleFilter: FilterFn<OrganizationMember> = (
  row,
  _columnId,
  value
) => memberMatchesRole(row.original, value)

const memberMatchesLoginMethod = (
  member: OrganizationMember,
  value: unknown
) => {
  const methods = Array.isArray(value) ? value : []
  return (
    methods.length === 0 ||
    methods.some(
      (method) =>
        (method === "github" && member.githubLinked) ||
        (method === "passkey" && member.passkeyLinked)
    )
  )
}

const memberLoginMethodFilter: FilterFn<OrganizationMember> = (
  row,
  _columnId,
  value
) => memberMatchesLoginMethod(row.original, value)

export const countMatchingMembers = (
  members: OrganizationMember[],
  {
    query,
    roles,
    methods,
  }: {
    query: string
    roles: readonly OrganizationRole[]
    methods: readonly ("github" | "passkey")[]
  }
) =>
  members.filter(
    (member) =>
      memberMatchesSearch(member, query) &&
      memberMatchesRole(member, roles) &&
      memberMatchesLoginMethod(member, methods)
  ).length

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

export const useMemberTableColumns = ({
  organizationRole,
  members,
  canManageMembers,
  canManageRoles,
  canTransferSuperAdmin,
  onChangeRole,
  onRequestRemove,
}: {
  organizationRole: OrganizationRole
  members: OrganizationMember[]
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
      if (!canManageRoles) return nextRole === member.role
      if (nextRole === "super_admin" && !canTransferSuperAdmin) return false
      return !(isOnlySuperAdmin(member) && nextRole !== "super_admin")
    },
    [canManageRoles, canTransferSuperAdmin, isOnlySuperAdmin]
  )

  return useMemo<ColumnDef<OrganizationMember>[]>(
    () => [
      {
        id: "user",
        accessorFn: (member) => member.name,
        filterFn: memberSearchFilter,
        header: ({ column }) => (
          <SortableMemberHeader column={column} label="Member" />
        ),
        meta: {
          headerClassName: "min-w-56",
          cellClassName: "min-w-56",
        },
        cell: ({ row }) => <UserIdentity user={row.original} />,
      },
      {
        id: "github",
        header: "GitHub",
        enableSorting: false,
        filterFn: memberLoginMethodFilter,
        meta: {
          headerClassName: "w-24 min-w-24 text-center",
          cellClassName: "w-24 min-w-24 text-center",
        },
        cell: ({ row }) =>
          row.original.githubLinked ? (
            <LinkedLoginMethod memberName={row.original.name} method="github" />
          ) : null,
      },
      {
        id: "passkey",
        header: "Passkey",
        enableSorting: false,
        meta: {
          headerClassName: "w-24 min-w-24 text-center",
          cellClassName: "w-24 min-w-24 text-center",
        },
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
        meta: {
          headerClassName: "w-40 min-w-40",
          cellClassName: "w-40 min-w-40",
        },
        cell: ({ row }) => <LocalDate value={row.original.createdAt} />,
      },
      {
        accessorKey: "role",
        filterFn: memberRoleFilter,
        sortingFn: memberRoleSorting,
        header: ({ column }) => (
          <SortableMemberHeader column={column} label="Role" />
        ),
        meta: {
          headerClassName: "w-44 min-w-44",
          cellClassName: "w-44 min-w-44",
        },
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
        meta: {
          headerClassName: "w-14 text-right",
          cellClassName: "w-14 text-right",
        },
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
}
