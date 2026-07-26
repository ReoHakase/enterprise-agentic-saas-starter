import { Elysia } from "elysia"

import {
  authenticatedErrorResponses,
  tenantErrorResponses,
} from "../../models/api"
import type { GetSessionContext } from "../auth/public"
import type { AccessControlFactory } from "../authorization/public"
import type { OrganizationDeletionAccessService } from "./deletion-access-service"
import type { InvitationService } from "./invitation-service"
import {
  activateOrganizationResponseModel,
  createOrganizationBodyModel,
  deleteOrganizationBodyModel,
  deleteOrganizationResponseModel,
  idResponseModel,
  memberListModel,
  organizationDetailModel,
  organizationIdParamsModel,
  organizationListModel,
  organizationMemberParamsModel,
  removeMemberBodyModel,
  transferSuperAdminBodyModel,
  updateMemberRoleBodyModel,
  updateOrganizationBodyModel,
} from "./model"
import { createOrganizationDeletionAccessRoutes } from "./routes/deletion-access"
import { createOrganizationInvitationRoutes } from "./routes/invitations"
import type { OrganizationsService } from "./service"

const createOrganizationCoreRoutes = (
  service: OrganizationsService,
  deletionAccessService: OrganizationDeletionAccessService,
  createAccessControl: AccessControlFactory,
  getSessionContext: GetSessionContext
) =>
  new Elysia({ name: "organization-core-routes" })
    .use(createAccessControl())
    .use(
      createOrganizationDeletionAccessRoutes(
        deletionAccessService,
        getSessionContext
      )
    )
    .get(
      "/organizations",
      async ({ authContext: { session, user } }) =>
        service.listOrganizations({
          userId: user.id,
          activeOrganizationId: session.activeOrganizationId,
        }),
      {
        authenticated: true,
        response: {
          200: organizationListModel,
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "listOrganizations",
          summary: "List the user's organizations",
          description:
            "Lists only organizations in which the authenticated user has a current membership and marks the active tenant. Organizations belonging solely to other users are never enumerated.",
          tags: ["Organizations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/organizations",
      async ({ authContext: { session, user }, body, status }) =>
        status(
          201,
          await service.createOrganization({
            userId: user.id,
            sessionId: session.id,
            name: body.name,
            slug: body.slug,
            keepCurrentActiveOrganization: body.keepCurrentActiveOrganization,
          })
        ),
      {
        authenticated: true,
        body: createOrganizationBodyModel,
        response: {
          201: organizationDetailModel,
          400: tenantErrorResponses[400],
          409: tenantErrorResponses[409],
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "createOrganization",
          summary: "Create an organization",
          description:
            "Creates a tenant organization, installs the authenticated user as its sole super administrator, and activates the new organization unless the request explicitly preserves the current tenant.",
          tags: ["Organizations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/organizations/:organizationId/activate",
      async ({ authContext: { session, user }, organizationAccess }) =>
        service.activateOrganization({
          userId: user.id,
          sessionId: session.id,
          organizationId: organizationAccess.id,
        }),
      {
        organizationAccess: {
          action: "organization.activate",
          requireActive: false,
          source: "params",
        },
        params: organizationIdParamsModel,
        response: {
          200: activateOrganizationResponseModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "activateOrganization",
          summary: "Activate an organization",
          description:
            "Switches only the current authenticated session to an organization after revalidating membership. Other accounts and sessions retain their existing active organization context.",
          tags: ["Organizations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/organizations/:organizationId",
      async ({ authContext: { session, user }, organizationAccess }) =>
        service.getOrganization({
          userId: user.id,
          organizationId: organizationAccess.id,
          activeOrganizationId: session.activeOrganizationId,
        }),
      {
        organizationAccess: {
          action: "organization.read",
          source: "params",
        },
        params: organizationIdParamsModel,
        response: { 200: organizationDetailModel, ...tenantErrorResponses },
        detail: {
          operationId: "getOrganization",
          summary: "Retrieve the active organization",
          description:
            "Returns organization details only when the requested tenant is active and the authenticated user remains a member. Cross-tenant identifiers are projected as not found.",
          tags: ["Organizations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .patch(
      "/organizations/:organizationId",
      async ({ authContext: { user }, body, organizationAccess }) =>
        service.updateOrganization({
          userId: user.id,
          organizationId: organizationAccess.id,
          name: body.name,
          slug: body.slug,
        }),
      {
        organizationAccess: {
          action: "organization.update",
          allow: ["super_admin"],
          source: "params",
        },
        params: organizationIdParamsModel,
        body: updateOrganizationBodyModel,
        response: { 200: organizationDetailModel, ...tenantErrorResponses },
        detail: {
          operationId: "updateOrganization",
          summary: "Update organization settings",
          description:
            "Updates the active organization's validated name or slug. Only its current super administrator may perform this mutation, and slug conflicts return a bounded conflict response.",
          tags: ["Organizations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/organizations/:organizationId",
      async ({ authContext, body, organizationDeletionAccess }) => {
        if (organizationDeletionAccess.replayDeletionId) {
          return {
            deletionId: organizationDeletionAccess.replayDeletionId,
            organizationId: organizationDeletionAccess.organizationId,
            status: "deleted" as const,
          }
        }

        return service.deleteOrganization({
          userId: authContext.user.id,
          session: authContext.session,
          organizationId: organizationDeletionAccess.organizationId,
          slug: body.slug,
          confirmation: body.confirmation,
          idempotencyKey: body.idempotencyKey,
        })
      },
      {
        organizationDeletionAccess: true,
        params: organizationIdParamsModel,
        body: deleteOrganizationBodyModel,
        response: {
          200: deleteOrganizationResponseModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "deleteOrganization",
          summary: "Delete an organization",
          description:
            "Deletes tenant data only for the active organization's super administrator with a fresh session, exact slug, DELETE confirmation, and opaque idempotency key. Repeating the same actor, tenant, and key returns the same receipt while private R2 cleanup retries durably.",
          tags: ["Organizations"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )

const createOrganizationMemberRoutes = (
  service: OrganizationsService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "organization-member-routes" })
    .use(createAccessControl())
    .get(
      "/organizations/:organizationId/members",
      async ({ authContext: { user }, organizationAccess }) =>
        service.listMembers({
          userId: user.id,
          organizationId: organizationAccess.id,
        }),
      {
        organizationAccess: {
          action: "organization.member.list",
          source: "params",
        },
        params: organizationIdParamsModel,
        response: { 200: memberListModel, ...tenantErrorResponses },
        detail: {
          operationId: "listOrganizationMembers",
          summary: "List organization members",
          description:
            "Lists members and effective roles only within the validated active organization. The authenticated caller must remain a member, and user data from another tenant is excluded.",
          tags: ["Organization members"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .patch(
      "/organizations/:organizationId/members/:memberId",
      async ({ authContext, body, organizationAccess, params }) =>
        service.updateMemberRole({
          userId: authContext.user.id,
          session: authContext.session,
          organizationId: organizationAccess.id,
          memberId: params.memberId,
          role: body.role,
        }),
      {
        organizationAccess: {
          action: "organization.member.role_update",
          allow: ["super_admin"],
          fresh: true,
          source: "params",
        },
        params: organizationMemberParamsModel,
        body: updateMemberRoleBodyModel,
        response: { 200: memberListModel, ...tenantErrorResponses },
        detail: {
          operationId: "updateOrganizationMemberRole",
          summary: "Update an organization member role",
          description:
            "Allows only the active organization's super administrator with a fresh session to change an admin or member role. Super administrator ownership must use the dedicated transfer operation.",
          tags: ["Organization members"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/organizations/:organizationId/ownership-transfer",
      async ({ authContext, body, organizationAccess }) =>
        service.transferSuperAdmin({
          userId: authContext.user.id,
          session: authContext.session,
          organizationId: organizationAccess.id,
          memberId: body.memberId,
          confirmation: body.confirmation,
        }),
      {
        organizationAccess: {
          action: "organization.transfer_super_admin",
          allow: ["super_admin"],
          fresh: true,
          source: "params",
        },
        params: organizationIdParamsModel,
        body: transferSuperAdminBodyModel,
        response: { 200: memberListModel, ...tenantErrorResponses },
        detail: {
          operationId: "transferOrganizationSuperAdmin",
          summary: "Transfer organization ownership",
          description:
            "Transfers the super administrator role transactionally after requiring a fresh session and exact confirmation of the target member's email. The organization retains exactly one super administrator.",
          tags: ["Organization members"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/organizations/:organizationId/members/:memberId",
      async ({ authContext, body, organizationAccess, params }) =>
        service.removeMember({
          userId: authContext.user.id,
          session: authContext.session,
          organizationId: organizationAccess.id,
          memberId: params.memberId,
          confirmation: body.confirmation,
        }),
      {
        organizationAccess: {
          action: "organization.member.remove",
          allow: ["super_admin", "admin"],
          fresh: true,
          source: "params",
        },
        params: organizationMemberParamsModel,
        body: removeMemberBodyModel,
        response: {
          200: idResponseModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "removeOrganizationMember",
          summary: "Remove an organization member",
          description:
            "Removes a member after requiring a fresh session and exact confirmation of the target email. Administrators may remove ordinary members only, while protected ownership invariants remain enforced.",
          tags: ["Organization members"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )

export const createOrganizationsRoutes = (
  service: OrganizationsService,
  invitationService: InvitationService,
  deletionAccessService: OrganizationDeletionAccessService,
  createAccessControl: AccessControlFactory,
  getSessionContext: GetSessionContext
) =>
  new Elysia({ name: "organizations" })
    .use(createAccessControl())
    .use(
      createOrganizationCoreRoutes(
        service,
        deletionAccessService,
        createAccessControl,
        getSessionContext
      )
    )
    .use(createOrganizationMemberRoutes(service, createAccessControl))
    .use(
      createOrganizationInvitationRoutes(invitationService, createAccessControl)
    )
