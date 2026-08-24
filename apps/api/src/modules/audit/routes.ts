import type { AuditAction } from "@enterprise-agentic-saas/db/schema"
import { Elysia } from "elysia"

import { tenantErrorResponses } from "../../models/api"
import type { AccessControlFactory } from "../authorization/public"
import {
  auditEventListModel,
  type AuditEvent,
  listAuditEventsQueryModel,
  organizationIdParamsModel,
} from "./model"

type ListAuditEvents = (input: {
  action?: AuditAction
  limit: number
  organizationId: string
}) => Promise<AuditEvent[]>

export const createAuditRoutes = (
  listEvents: ListAuditEvents,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "audit" }).use(createAccessControl()).get(
    "/organizations/:organizationId/audit-logs",
    ({ organizationAccess, query }) =>
      listEvents({
        organizationId: organizationAccess.id,
        action: query.action,
        limit: query.limit ?? 50,
      }),
    {
      organizationAccess: {
        action: "organization.audit.read",
        allow: ["owner", "admin"],
        source: "params",
      },
      params: organizationIdParamsModel,
      query: listAuditEventsQueryModel,
      response: { 200: auditEventListModel, ...tenantErrorResponses },
      detail: {
        operationId: "listOrganizationAuditLogs",
        summary: "List organization audit events",
        description:
          "Returns append-only audit events in reverse chronological order for the active organization. Only owners and administrators may read this tenant-scoped collection.",
        tags: ["Audit"],
        "x-route-status": "enabled",
        "x-auth-context": "session-cookie",
        "x-audience": "first-party-web",
      },
    }
  )
