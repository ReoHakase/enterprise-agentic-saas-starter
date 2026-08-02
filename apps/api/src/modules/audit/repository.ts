import type { Db } from "@enterprise-agentic-saas/db"
import { auditLogs } from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq } from "drizzle-orm"

import type { AuditAction, AuditEvent, AuditTargetType } from "./ports"

const auditActions = [
  "organization.created",
  "organization.updated",
  "organization.member.role_updated",
  "organization.owner.transferred",
  "organization.member.removed",
  "organization.invitation.created",
  "organization.invitation.resent",
  "organization.invitation.canceled",
  "issue.created",
  "issue.updated",
  "issue.deleted",
  "issue.comment.created",
  "issue.comment.updated",
  "issue.comment.deleted",
] as const

const auditTargetTypes: AuditTargetType[] = [
  "invitation",
  "member",
  "organization",
  "issue",
  "issue_comment",
]
const isAuditAction = (value: string): value is AuditAction =>
  auditActions.some((action) => action === value)

const isAuditTargetType = (value: string): value is AuditTargetType =>
  auditTargetTypes.some((targetType) => targetType === value)

export const listAuditEvents = async (
  db: Db,
  input: { action?: AuditAction; limit: number; organizationId: string }
): Promise<AuditEvent[]> => {
  const conditions = [eq(auditLogs.organizationId, input.organizationId)]
  if (input.action) {
    conditions.push(eq(auditLogs.action, input.action))
  }

  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(input.limit)

  return rows.map((row) => {
    if (!isAuditAction(row.action) || !isAuditTargetType(row.targetType)) {
      throw new Error("Invalid audit log discriminator")
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      actorUserId: row.actorUserId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    }
  })
}
