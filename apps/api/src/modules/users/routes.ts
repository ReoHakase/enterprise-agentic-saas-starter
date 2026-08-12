import { Elysia } from "elysia"

import {
  authenticatedErrorResponses,
  tenantErrorResponses,
} from "../../models/api"
import type { AccessControlFactory } from "../authorization/public"
import {
  currentUserModel,
  mcpOAuthCredentialListModel,
  mcpOAuthCredentialParamsModel,
  revokedSessionResponseModel,
  revokedSessionsResponseModel,
  updateUserBodyModel,
  userModel,
  userSessionListModel,
  userSessionParamsModel,
} from "./model"
import type { UsersService } from "./service"

export const createUsersRoutes = (
  service: UsersService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "users" })
    .use(createAccessControl())
    .get(
      "/me",
      async ({ authContext: { session, user } }) =>
        service.getMe({
          sessionId: session.id,
          userId: user.id,
          activeOrganizationId: session.activeOrganizationId,
        }),
      {
        authenticated: true,
        response: {
          200: currentUserModel,
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "getCurrentUser",
          summary: "Retrieve the current user context",
          description:
            "Returns the authenticated user, active organization, memberships, and roles for the first-party console. A stale active organization is repaired transactionally from a valid recent session, a sole membership, or an explicit selection.",
          tags: ["Users"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .patch(
      "/me",
      async ({ authContext: { user }, body }) =>
        service.updateMe({ userId: user.id, name: body.name }),
      {
        authenticated: true,
        body: updateUserBodyModel,
        response: {
          200: userModel,
          400: tenantErrorResponses[400],
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "updateCurrentUser",
          summary: "Update the current user profile",
          description:
            "Updates the authenticated user's display name for the first-party console. This mutation does not change the email address, active sessions, or organization memberships.",
          tags: ["Users"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/me/sessions",
      async ({ authContext: { session, user } }) =>
        service.listUserSessions({
          userId: user.id,
          currentSessionId: session.id,
        }),
      {
        authenticated: true,
        response: {
          200: userSessionListModel,
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "listCurrentUserSessions",
          summary: "List the current user's sessions",
          description:
            "Lists every authenticated session owned by the current user and marks the session making this request. Sessions belonging to another account are never returned.",
          tags: ["Sessions"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/me/sessions",
      async ({ authContext: { session, user } }) =>
        service.revokeOtherUserSessions({
          userId: user.id,
          currentSessionId: session.id,
        }),
      {
        authenticated: true,
        response: {
          200: revokedSessionsResponseModel,
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "revokeOtherCurrentUserSessions",
          summary: "Revoke all other user sessions",
          description:
            "Revokes all sessions owned by the authenticated user except the current session. Better Auth device sessions used for account switching remain a separate lifecycle.",
          tags: ["Sessions"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/me/sessions/:sessionId",
      async ({ authContext: { session, user }, params }) =>
        service.revokeUserSession({
          userId: user.id,
          currentSessionId: session.id,
          sessionId: params.sessionId,
        }),
      {
        authenticated: true,
        params: userSessionParamsModel,
        response: {
          200: revokedSessionResponseModel,
          400: tenantErrorResponses[400],
          404: tenantErrorResponses[404],
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "revokeCurrentUserSession",
          summary: "Revoke a selected user session",
          description:
            "Revokes one session owned by the authenticated user. The current session must use the sign-out flow, and an identifier owned by another user is projected as not found.",
          tags: ["Sessions"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/me/mcp-oauth/sessions",
      ({ authContext: { user } }) =>
        service.listMcpOAuthCredentials({ userId: user.id }),
      {
        authenticated: true,
        response: {
          200: mcpOAuthCredentialListModel,
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "listCurrentUserMcpOAuthCredentials",
          summary: "List the current user's MCP OAuth credentials",
          description:
            "Lists active MCP OAuth credential families without exposing bearer or refresh token values. Organization details are projected only for current memberships.",
          tags: ["MCP OAuth"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/me/mcp-oauth/sessions/:credentialId",
      ({ authContext: { user }, params }) =>
        service.revokeMcpOAuthCredential({
          credentialId: params.credentialId,
          userId: user.id,
        }),
      {
        authenticated: true,
        params: mcpOAuthCredentialParamsModel,
        response: {
          200: revokedSessionResponseModel,
          404: tenantErrorResponses[404],
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "revokeCurrentUserMcpOAuthCredential",
          summary: "Revoke an MCP OAuth credential",
          description:
            "Revokes the selected MCP OAuth credential family owned by the authenticated user. Token values are never accepted or returned by this route.",
          tags: ["MCP OAuth"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
