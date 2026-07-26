import { Elysia } from "elysia"

import {
  invitationErrorResponses,
  tenantErrorResponses,
} from "../../../models/api"
import type { AccessControlFactory } from "../../authorization/public"
import type { InvitationService } from "../invitation-service"
import {
  canceledInvitationResponseModel,
  createInvitationBodyModel,
  invitationBatchModel,
  invitationListModel,
  organizationIdParamsModel,
  organizationInvitationParamsModel,
  resendInvitationResponseModel,
} from "../model"

export const createOrganizationInvitationRoutes = (
  service: InvitationService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "organization-invitation-routes" })
    .use(createAccessControl())
    .get(
      "/organizations/:organizationId/invitations",
      async ({ authContext: { user }, organizationAccess }) =>
        service.listInvitations({
          userId: user.id,
          organizationId: organizationAccess.id,
        }),
      {
        organizationAccess: {
          action: "invitation.list",
          allow: ["super_admin", "admin"],
          source: "params",
        },
        params: organizationIdParamsModel,
        response: { 200: invitationListModel, ...tenantErrorResponses },
        detail: {
          operationId: "listOrganizationInvitations",
          summary: "List organization invitations",
          description:
            "Lists invitations and expiration state within the validated active organization. Only administrators and super administrators may access this tenant-scoped collection.",
          tags: ["Organization invitations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/organizations/:organizationId/invitations",
      async ({ authContext, body, organizationAccess, status }) =>
        status(
          201,
          await service.createInvitation({
            userId: authContext.user.id,
            session: authContext.session,
            organizationId: organizationAccess.id,
            emails: body.emails,
            role: body.role,
          })
        ),
      {
        organizationAccess: {
          action: "invitation.create",
          allow: ["super_admin", "admin"],
          source: "params",
        },
        params: organizationIdParamsModel,
        body: createInvitationBodyModel,
        response: { 201: invitationBatchModel, ...invitationErrorResponses },
        detail: {
          operationId: "createOrganizationInvitation",
          summary: "Create organization invitations",
          description:
            "Normalizes and deduplicates one to twenty email addresses, then atomically queues invitations with one role. Administrators may invite members; inviting administrators requires a fresh super administrator session. Actor and tenant hourly quotas return 429 with Retry-After.",
          tags: ["Organization invitations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/organizations/:organizationId/invitations/:invitationId/resend",
      async ({ authContext, organizationAccess, params }) =>
        service.resendInvitation({
          userId: authContext.user.id,
          session: authContext.session,
          organizationId: organizationAccess.id,
          invitationId: params.invitationId,
        }),
      {
        organizationAccess: {
          action: "invitation.resend",
          allow: ["super_admin", "admin"],
          source: "params",
        },
        params: organizationInvitationParamsModel,
        response: {
          200: resendInvitationResponseModel,
          ...invitationErrorResponses,
        },
        detail: {
          operationId: "resendOrganizationInvitation",
          summary: "Resend an organization invitation",
          description:
            "Extends a pending or expired invitation by forty-eight hours with the same identifier and requeues its durable email job. Administrator-role invitations require a fresh super administrator session, and tenant, recipient, and rate-limit checks match creation.",
          tags: ["Organization invitations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/organizations/:organizationId/invitations/:invitationId",
      async ({ authContext: { user }, organizationAccess, params }) =>
        service.cancelInvitation({
          userId: user.id,
          organizationId: organizationAccess.id,
          invitationId: params.invitationId,
        }),
      {
        organizationAccess: {
          action: "invitation.cancel",
          allow: ["super_admin", "admin"],
          source: "params",
        },
        params: organizationInvitationParamsModel,
        response: {
          200: canceledInvitationResponseModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "cancelOrganizationInvitation",
          summary: "Cancel an organization invitation",
          description:
            "Cancels only a pending, unexpired invitation in the validated active organization. Terminal states are not overwritten, and identifiers from another tenant are projected as not found.",
          tags: ["Organization invitations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
