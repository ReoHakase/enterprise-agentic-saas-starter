import { Elysia } from "elysia"

import { tenantErrorResponses } from "../../models/api"
import type { AccessControlFactory } from "../authorization/public"
import {
  auditEventListModel,
  listAuditEventsQueryModel,
  organizationIdParamsModel,
} from "./model"
import type { AuditService } from "./service"

export const createAuditRoutes = (
  service: AuditService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "audit" }).use(createAccessControl()).get(
    "/organizations/:organizationId/audit-logs",
    ({ organizationAccess, query }) =>
      service.listEvents({
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
        summary: "List organization audit events",
        description:
          "Returns append-only audit events in reverse chronological order for the active organization. Only administrators and super administrators may read this tenant-scoped collection.",
        tags: ["Audit"],
        "x-route-status": "enabled",
        "x-auth-context": "session-cookie",
        "x-audience": "first-party-web",
      },
    }
  )
