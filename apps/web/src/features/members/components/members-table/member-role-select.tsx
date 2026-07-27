"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { useCallback, useContext } from "react"

import {
  OrganizationRoleBadge,
  type OrganizationRole,
} from "@/features/organizations"

import type { OrganizationMember } from "../../schema"
import { MemberMutationContext } from "./members-table-context"

const organizationRoleOptions = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
  { label: "Super Admin", value: "super_admin" },
] satisfies ReadonlyArray<{ label: string; value: OrganizationRole }>

const isOrganizationRole = (value: string | null): value is OrganizationRole =>
  value === "super_admin" || value === "admin" || value === "member"

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
          <OrganizationRoleBadge role={member.role} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {organizationRoleOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={!canSelectRole(member, option.value)}
              >
                <OrganizationRoleBadge role={option.value} />
              </SelectItem>
            ))}
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
