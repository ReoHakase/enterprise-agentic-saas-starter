import type { Db } from "@enterprise-agentic-saas/db"

import type { AccessControlFactory } from "../authorization/public"
import { listAuditEvents } from "./repository"
import { createAuditRoutes } from "./routes"
import { createAuditService } from "./service"

export const createAuditModule = (
  db: Db,
  createAccessControl: AccessControlFactory
) =>
  createAuditRoutes(
    createAuditService({
      listEvents: (input) => listAuditEvents(db, input),
    }),
    createAccessControl
  )
