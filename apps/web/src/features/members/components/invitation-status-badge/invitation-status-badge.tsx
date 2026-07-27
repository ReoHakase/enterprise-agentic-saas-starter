import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  BanIcon,
  CircleCheckIcon,
  CircleXIcon,
  Clock3Icon,
  ClockAlertIcon,
} from "lucide-react"

import type { OrganizationInvitationStatus } from "../../schema"

const invitationStatusLabel: Record<OrganizationInvitationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  canceled: "Canceled",
}

const invitationStatusBadgeClass: Record<OrganizationInvitationStatus, string> =
  {
    pending:
      "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    accepted:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    rejected: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300",
    expired:
      "border-slate-500/40 bg-slate-500/10 text-slate-800 dark:text-slate-300",
    canceled: "border-border bg-muted text-muted-foreground",
  }

const invitationStatusIcon = {
  pending: Clock3Icon,
  accepted: CircleCheckIcon,
  rejected: CircleXIcon,
  expired: ClockAlertIcon,
  canceled: BanIcon,
} satisfies Record<OrganizationInvitationStatus, typeof Clock3Icon>

export type InvitationStatusBadgeProps = {
  status: OrganizationInvitationStatus
}

export const InvitationStatusBadge = ({
  status,
}: InvitationStatusBadgeProps) => {
  const Icon = invitationStatusIcon[status]

  return (
    <Badge
      className={invitationStatusBadgeClass[status]}
      variant="outline"
      data-testid={`invitation-status-${status}`}
    >
      <Icon aria-hidden="true" data-testid={`status-icon-${status}`} />
      <span>{invitationStatusLabel[status]}</span>
    </Badge>
  )
}
