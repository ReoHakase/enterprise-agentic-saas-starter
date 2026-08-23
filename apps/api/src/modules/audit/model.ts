import {
  auditActions,
  auditTargetTypes,
} from "@enterprise-agentic-saas/db/schema"
import * as v from "valibot"

import {
  isoTimestampModel,
  organizationIdParamsModel,
  positiveIntegerQueryModel,
} from "../../models/common"

const auditActionModel = v.picklist(auditActions)

const auditEventModel = v.object({
  id: v.string(),
  organizationId: v.string(),
  actorUserId: v.nullable(v.string()),
  action: auditActionModel,
  targetType: v.picklist(auditTargetTypes),
  targetId: v.nullable(v.string()),
  metadata: v.record(
    v.string(),
    v.union([v.string(), v.number(), v.boolean(), v.null()])
  ),
  createdAt: isoTimestampModel,
})

export const auditEventListModel = v.array(auditEventModel)
export type AuditEvent = v.InferOutput<typeof auditEventModel>

export const listAuditEventsQueryModel = v.object({
  action: v.optional(auditActionModel),
  limit: v.optional(positiveIntegerQueryModel(100)),
})

export { organizationIdParamsModel }
