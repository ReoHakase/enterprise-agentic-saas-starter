import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia, t } from "elysia"

import {
  authenticatedErrorResponses,
  tenantErrorResponses,
} from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
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
    .use(createAccessControlModule(db))
    .get(
      "/me",
      async ({ authContext: { session, user } }) =>
        getMe(db, {
          sessionId: session.id,
          userId: user.id,
          activeOrganizationId: session.activeOrganizationId,
        }),
      {
        authenticated: true,
        response: {
          200: t.Object({
            user: userModel,
            activeOrganizationId: t.Nullable(t.String()),
            organizations: t.Array(organizationSummaryModel),
          }),
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "getCurrentUser",
          summary: "現在のユーザーと組織contextを取得",
          description:
            "session user、active organization、所属組織と権限を返す。staleなactive organizationは有効なrecent session、単一membership、明示選択の順にtransaction内で修復する。",
          tags: ["Users"],
        },
      }
    )
    .patch(
      "/me",
      async ({ authContext: { user }, body }) =>
        updateMe(db, { userId: user.id, name: body.name }),
      {
        authenticated: true,
        body: t.Object({ name: t.String({ minLength: 1 }) }),
        response: {
          200: userModel,
          400: tenantErrorResponses[400],
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "updateCurrentUser",
          summary: "プロフィールを更新",
          description:
            "現在のuserの表示名を更新する。emailやsession、organization membershipは変更しない。",
          tags: ["Users"],
        },
      }
    )
    .get(
      "/me/sessions",
      async ({ authContext: { session, user } }) =>
        listUserSessions(db, {
          userId: user.id,
          currentSessionId: session.id,
        }),
      {
        authenticated: true,
        response: {
          200: t.Array(
            t.Object({
              id: t.String(),
              current: t.Boolean(),
              expiresAt: t.String({ format: "date-time" }),
              createdAt: t.String({ format: "date-time" }),
              updatedAt: t.String({ format: "date-time" }),
              ipAddress: t.Nullable(t.String()),
              userAgent: t.Nullable(t.String()),
            })
          ),
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "listCurrentUserSessions",
          summary: "ログインsession一覧を取得",
          description:
            "現在のuserに属するsessionを列挙し、現在のsessionを識別して返す。",
          tags: ["Sessions"],
        },
      }
    )
    .delete(
      "/me/sessions",
      async ({ authContext: { session, user } }) =>
        revokeOtherUserSessions(db, {
          userId: user.id,
          currentSessionId: session.id,
        }),
      {
        authenticated: true,
        response: {
          200: t.Object({ revoked: t.Number({ minimum: 0 }) }),
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "revokeOtherCurrentUserSessions",
          summary: "現在以外のsessionをすべて失効",
          description:
            "複数アカウント切替用のdevice sessionとは別に、現在のuserに属する他sessionを失効する。",
          tags: ["Sessions"],
        },
      }
    )
    .delete(
      "/me/sessions/:sessionId",
      async ({ authContext: { session, user }, params }) =>
        revokeUserSession(db, {
          userId: user.id,
          currentSessionId: session.id,
          sessionId: params.sessionId,
        }),
      {
        authenticated: true,
        params: t.Object({ sessionId: t.String() }),
        response: {
          200: t.Object({ id: t.String() }),
          400: tenantErrorResponses[400],
          404: tenantErrorResponses[404],
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "revokeCurrentUserSession",
          summary: "指定sessionを失効",
          description:
            "現在のsessionはこのendpointでは失効できない。別userのsession idはnot foundとして扱う。",
          tags: ["Sessions"],
        },
      }
    )
