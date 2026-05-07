import type { Db } from "@enterprise-agentic-saas/db"

import { listOrganizationsForUser } from "./repository"

export const listOrganizations = async (db: Db, userId: string) =>
  listOrganizationsForUser(db, userId)
