import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia, t } from "elysia"

import { tenantErrorResponses } from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import { listAuditEvents } from "./repository"

const auditActionModel = t.Union([
  t.Literal("organization.created"),
  t.Literal("organization.updated"),
  t.Literal("organization.member.role_updated"),
  t.Literal("organization.super_admin.transferred"),
  t.Literal("organization.member.removed"),
  t.Literal("organization.invitation.created"),
  t.Literal("organization.invitation.canceled"),
  t.Literal("todo.created"),
  t.Literal("todo.updated"),
  t.Literal("todo.deleted"),
  t.Literal("todo.comment.created"),
  t.Literal("todo.comment.updated"),
  t.Literal("todo.comment.deleted"),
])

const auditEventModel = t.Object({
  id: t.String(),
  organizationId: t.String(),
  actorUserId: t.Nullable(t.String()),
  action: auditActionModel,
  targetType: t.Union([
    t.Literal("organization"),
    t.Literal("member"),
    t.Literal("invitation"),
    t.Literal("todo"),
    t.Literal("todo_comment"),
  ]),
  targetId: t.Nullable(t.String()),
  metadata: t.Record(
    t.String(),
    t.Union([t.String(), t.Number(), t.Boolean(), t.Null()])
  ),
  createdAt: t.String({ format: "date-time" }),
})

export const createAuditModule = (db: Db) =>
  new Elysia({ name: "audit" }).use(createAccessControlModule(db)).get(
    "/organizations/:organizationId/audit-logs",
    ({ organizationAccess, query }) =>
      listAuditEvents(db, {
        organizationId: organizationAccess.id,
        action: query.action,
        limit: query.limit ?? 50,
      }),
    {
      organizationAccess: {
        action: "organization.audit.read",
        allow: ["super_admin", "admin"],
        source: "params",
      },
      params: t.Object({ organizationId: t.String() }),
      query: t.Object({
        action: t.Optional(auditActionModel),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
      response: { 200: t.Array(auditEventModel), ...tenantErrorResponses },
      detail: {
        operationId: "listOrganizationAuditLogs",
        summary: "organization監査ログを取得",
        description:
          "append-only監査eventを新しい順で返す。tenant境界を強制し、admin以上だけが参照できる。",
        tags: ["Audit"],
      },
    }
  )
