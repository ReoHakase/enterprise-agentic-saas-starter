import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia, t } from "elysia"

import { getSessionContext } from "../auth/session"
import {
  getMe,
  listUserSessions,
  revokeOtherUserSessions,
  revokeUserSession,
  updateMe,
} from "./service"

const permissionsModel = t.Object({
  canEditOrganization: t.Boolean(),
  canInviteMembers: t.Boolean(),
  canManageMembers: t.Boolean(),
  canManageAdmins: t.Boolean(),
  canTransferSuperAdmin: t.Boolean(),
})

const organizationSummaryModel = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  role: t.Union([
    t.Literal("super_admin"),
    t.Literal("admin"),
    t.Literal("member"),
  ]),
  active: t.Boolean(),
  memberCount: t.Number(),
  memberAvatars: t.Array(
    t.Object({
      userId: t.String(),
      name: t.String(),
      image: t.Nullable(t.String()),
    })
  ),
  permissions: permissionsModel,
})

const userModel = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  image: t.Nullable(t.String()),
})

export const createUsersModule = (db: Db) =>
  new Elysia({ name: "users" })
    .get(
      "/me",
      async ({ request }) => {
        const { session, user } = await getSessionContext(request)
        return getMe(db, {
          userId: user.id,
          activeOrganizationId: session.activeOrganizationId,
        })
      },
      {
        response: t.Object({
          user: userModel,
          activeOrganizationId: t.Nullable(t.String()),
          organizations: t.Array(organizationSummaryModel),
        }),
      }
    )
    .patch(
      "/me",
      async ({ body, request }) => {
        const { user } = await getSessionContext(request)
        return updateMe(db, { userId: user.id, name: body.name })
      },
      {
        body: t.Object({ name: t.String({ minLength: 1 }) }),
        response: userModel,
      }
    )
    .get(
      "/me/sessions",
      async ({ request }) => {
        const { session, user } = await getSessionContext(request)
        return listUserSessions(db, {
          userId: user.id,
          currentSessionId: session.id,
        })
      },
      {
        response: t.Array(
          t.Object({
            id: t.String(),
            current: t.Boolean(),
            expiresAt: t.String(),
            createdAt: t.String(),
            updatedAt: t.String(),
            ipAddress: t.Nullable(t.String()),
            userAgent: t.Nullable(t.String()),
          })
        ),
      }
    )
    .delete(
      "/me/sessions",
      async ({ request }) => {
        const { session, user } = await getSessionContext(request)
        return revokeOtherUserSessions(db, {
          userId: user.id,
          currentSessionId: session.id,
        })
      },
      {
        response: t.Object({ revoked: t.Number() }),
      }
    )
    .delete(
      "/me/sessions/:sessionId",
      async ({ params, request }) => {
        const { session, user } = await getSessionContext(request)
        return revokeUserSession(db, {
          userId: user.id,
          currentSessionId: session.id,
          sessionId: params.sessionId,
        })
      },
      {
        params: t.Object({ sessionId: t.String() }),
        response: t.Object({ id: t.String() }),
      }
    )
