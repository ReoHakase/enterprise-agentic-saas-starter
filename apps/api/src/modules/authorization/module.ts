import type { Db } from "@enterprise-agentic-saas/db"

import { getSessionContext } from "../auth/public"
import { findMembership } from "./repository"
import { createAccessControlRoutes } from "./routes"
import { createAuthorizationService } from "./service"

export const createAuthorizationModule = (db: Db) => {
  const authorization = createAuthorizationService({
    findMembership: (input) => findMembership(db, input),
  })

  return {
    authorization,
    createAccessControl: () =>
      createAccessControlRoutes({ authorization, getSessionContext }),
  }
}
