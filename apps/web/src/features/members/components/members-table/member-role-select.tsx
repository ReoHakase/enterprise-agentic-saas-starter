"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { CrownIcon, ShieldIcon, UserRoundIcon } from "lucide-react"
import { useCallback, useContext } from "react"

import { roleLabel, type OrganizationRole } from "@/features/organizations"

import type { OrganizationMember } from "../../schema"
import { MemberMutationContext } from "./members-table-context"

const organizationRoleOptions = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
  { label: "Super Admin", value: "super_admin" },
]

const isOrganizationRole = (value: string | null): value is OrganizationRole =>
  value === "super_admin" || value === "admin" || value === "member"

const MemberRoleBadge = ({
  organizationRole,
}: {
  organizationRole: OrganizationRole
}) => {
  const className =
    organizationRole === "super_admin"
      ? "border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-300"
      : organizationRole === "admin"
        ? "border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-300"
        : "border-border bg-muted text-muted-foreground"
  const icon =
    organizationRole === "super_admin" ? (
      <CrownIcon aria-hidden="true" />
    ) : organizationRole === "admin" ? (
      <ShieldIcon aria-hidden="true" />
    ) : (
      <UserRoundIcon aria-hidden="true" />
    )

  return (
    <Badge
      className={className}
      variant="outline"
      data-testid={`member-role-${organizationRole}`}
    >
      {icon}
      <span>{roleLabel(organizationRole)}</span>
    </Badge>
  )
}

export const MemberRoleSelect = ({
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
          <MemberRoleBadge organizationRole={member.role} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem
              value="member"
              disabled={!canSelectRole(member, "member")}
            >
              <MemberRoleBadge organizationRole="member" />
            </SelectItem>
            <SelectItem
              value="admin"
              disabled={!canSelectRole(member, "admin")}
            >
              <MemberRoleBadge organizationRole="admin" />
            </SelectItem>
            <SelectItem
              value="super_admin"
              disabled={!canSelectRole(member, "super_admin")}
            >
              <MemberRoleBadge organizationRole="super_admin" />
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
