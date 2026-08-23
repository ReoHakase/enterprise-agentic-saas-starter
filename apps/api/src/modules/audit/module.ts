import type { Db } from "@enterprise-agentic-saas/db"

import type { AccessControlFactory } from "../authorization/public"
import { listAuditEvents } from "./repository"
import { createAuditRoutes } from "./routes"

export const createAuditModule = (
  db: Db,
  createAccessControl: AccessControlFactory
) =>
  createAuditRoutes((input) => listAuditEvents(db, input), createAccessControl)
