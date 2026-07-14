import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"

import { tenantErrorResponses } from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import {
  auditEventListModel,
  listAuditEventsQueryModel,
  organizationIdParamsModel,
} from "./model"
import { listAuditEvents } from "./repository"

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
      params: organizationIdParamsModel,
      query: listAuditEventsQueryModel,
      response: { 200: auditEventListModel, ...tenantErrorResponses },
      detail: {
        operationId: "listOrganizationAuditLogs",
        summary: "organization監査ログを取得",
        description:
          "append-only監査eventを新しい順で返す。tenant境界を強制し、admin以上だけが参照できる。",
        tags: ["Audit"],
      },
    }
  )
