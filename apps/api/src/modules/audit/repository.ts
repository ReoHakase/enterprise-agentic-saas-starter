import type { Db } from "@enterprise-agentic-saas/db"
import { auditLogs } from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"

export const auditActions = [
  "organization.created",
  "organization.updated",
  "organization.member.role_updated",
  "organization.super_admin.transferred",
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

export type AuditAction = (typeof auditActions)[number]
export type AuditTargetType =
  | "invitation"
  | "member"
  | "organization"
  | "issue"
  | "issue_comment"
const auditTargetTypes: AuditTargetType[] = [
  "invitation",
  "member",
  "organization",
  "issue",
  "issue_comment",
]
export type AuditMetadata = Record<string, boolean | null | number | string>

export type AuditEvent = {
  action: AuditAction
  actorUserId: string | null
  metadata?: AuditMetadata
  organizationId: string
  targetId?: string | null
  targetType: AuditTargetType
}

const isAuditAction = (value: string): value is AuditAction =>
  auditActions.some((action) => action === value)

const isAuditTargetType = (value: string): value is AuditTargetType =>
  auditTargetTypes.some((targetType) => targetType === value)

export const recordAuditEvent = async (db: Db, event: AuditEvent) => {
  try {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId ?? null,
      metadata: event.metadata ?? {},
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "audit",
      operation: "recordAuditEvent",
    })
  }
}

export const listAuditEvents = async (
  db: Db,
  input: { action?: AuditAction; limit: number; organizationId: string }
) => {
  try {
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
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "audit",
      operation: "listAuditEvents",
    })
  }
}
