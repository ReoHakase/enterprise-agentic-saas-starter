import { Elysia } from "elysia"

import { tenantErrorResponses } from "../../../models/api"
import type { AccessControlFactory } from "../../authorization/public"
import type { InvitationService } from "../invitation-service"
import {
  canceledInvitationResponseModel,
  invitationListModel,
  organizationIdParamsModel,
  organizationInvitationParamsModel,
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
          allow: ["owner", "admin"],
          source: "params",
        },
        params: organizationIdParamsModel,
        response: { 200: invitationListModel, ...tenantErrorResponses },
        detail: {
          operationId: "listOrganizationInvitations",
          summary: "List organization invitations",
          description:
            "Lists invitations and expiration state within the validated active organization. Only owners and administrators may access this tenant-scoped collection.",
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
          allow: ["owner", "admin"],
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
