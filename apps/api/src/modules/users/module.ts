import {
  listMcpOAuthCredentialFamilies,
  revokeMcpOAuthCredentialFamily,
} from "@enterprise-agentic-saas/auth/mcp-oauth-credentials"
import type { Db } from "@enterprise-agentic-saas/db"

import type { AccessControlFactory } from "../authorization/public"
import { listOrganizationsForUser } from "../organizations/public"
import {
  deleteOtherSessionsForUser,
  deleteSessionForUser,
  findUserProfile,
  listSessionsForUser,
  resolveAndPersistActiveOrganizationId,
  updateUserProfile,
} from "./repository"
import { createUsersRoutes } from "./routes"
import { createUsersService } from "./service"

export const createUsersModule = (
  db: Db,
  createAccessControl: AccessControlFactory
) =>
  createUsersRoutes(
    createUsersService({
      deleteOtherSessions: (input) => deleteOtherSessionsForUser(db, input),
      deleteSession: (input) => deleteSessionForUser(db, input),
      findUser: (userId) => findUserProfile(db, userId),
      listMcpOAuthCredentials: (userId) =>
        listMcpOAuthCredentialFamilies(db, userId),
      listOrganizations: (input) => listOrganizationsForUser(db, input),
      listSessions: (input) => listSessionsForUser(db, input),
      revokeMcpOAuthCredential: (input) =>
        revokeMcpOAuthCredentialFamily({ database: db, ...input }),
      resolveActiveOrganization: (input) =>
        resolveAndPersistActiveOrganizationId(db, input),
      updateUser: (input) => updateUserProfile(db, input),
    }),
    createAccessControl
  )
