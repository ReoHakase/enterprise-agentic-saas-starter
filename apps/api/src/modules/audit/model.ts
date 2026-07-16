import * as v from "valibot"

import {
  isoTimestampModel,
  organizationIdParamsModel,
  positiveIntegerQueryModel,
} from "../../models/common"

export const auditActionModel = v.picklist([
  "organization.created",
  "organization.updated",
  "organization.member.role_updated",
  "organization.super_admin.transferred",
  "organization.member.removed",
  "organization.invitation.created",
  "organization.invitation.resent",
  "organization.invitation.canceled",
  "todo.created",
  "todo.updated",
  "todo.deleted",
  "todo.comment.created",
  "todo.comment.updated",
  "todo.comment.deleted",
])

export const auditEventModel = v.object({
  id: v.string(),
  organizationId: v.string(),
  actorUserId: v.nullable(v.string()),
  action: auditActionModel,
  targetType: v.picklist([
    "organization",
    "member",
    "invitation",
    "todo",
    "todo_comment",
  ]),
  targetId: v.nullable(v.string()),
  metadata: v.record(
    v.string(),
    v.union([v.string(), v.number(), v.boolean(), v.null()])
  ),
  createdAt: isoTimestampModel,
})

export const auditEventListModel = v.array(auditEventModel)

export const listAuditEventsQueryModel = v.object({
  action: v.optional(auditActionModel),
  limit: v.optional(positiveIntegerQueryModel(100)),
})

export { organizationIdParamsModel }
