import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { CrownIcon, ShieldIcon, UserRoundIcon } from "lucide-react"

import { roleLabel, type OrganizationRole } from "../../schema"

const organizationRoleBadgeClass: Record<OrganizationRole, string> = {
  super_admin:
    "border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-300",
  admin: "border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-300",
  member: "border-border bg-muted text-muted-foreground",
}

const organizationRoleIcon = {
  super_admin: CrownIcon,
  admin: ShieldIcon,
  member: UserRoundIcon,
} satisfies Record<OrganizationRole, typeof CrownIcon>

export type OrganizationRoleBadgeProps = {
  role: OrganizationRole
}

export const OrganizationRoleBadge = ({ role }: OrganizationRoleBadgeProps) => {
  const Icon = organizationRoleIcon[role]

  return (
    <Badge
      className={organizationRoleBadgeClass[role]}
      variant="outline"
      data-testid={`organization-role-${role}`}
    >
      <Icon aria-hidden="true" data-testid={`role-icon-${role}`} />
      <span>{roleLabel(role)}</span>
    </Badge>
  )
}
