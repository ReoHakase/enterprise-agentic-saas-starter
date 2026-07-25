export type AuditAction =
  | "organization.created"
  | "organization.updated"
  | "organization.member.role_updated"
  | "organization.super_admin.transferred"
  | "organization.member.removed"
  | "organization.invitation.created"
  | "organization.invitation.resent"
  | "organization.invitation.canceled"
  | "issue.created"
  | "issue.updated"
  | "issue.deleted"
  | "issue.comment.created"
  | "issue.comment.updated"
  | "issue.comment.deleted"

export type AuditTargetType =
  | "invitation"
  | "member"
  | "organization"
  | "issue"
  | "issue_comment"

export type AuditEvent = {
  action: AuditAction
  actorUserId: string | null
  createdAt: string
  id: string
  metadata: Record<string, boolean | null | number | string>
  organizationId: string
  targetId: string | null
  targetType: AuditTargetType
}

export type AuditPorts = {
  listEvents(input: {
    action?: AuditAction
    limit: number
    organizationId: string
  }): Promise<AuditEvent[]>
}
