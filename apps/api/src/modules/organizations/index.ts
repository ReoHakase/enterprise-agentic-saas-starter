import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia, t } from "elysia"

import { getSessionContext } from "../auth/session"
import {
  activateOrganization,
  cancelInvitation,
  createInvitation,
  createOrganization,
  getOrganization,
  listInvitations,
  listMembers,
  listOrganizations,
  removeMember,
  updateMemberRole,
  updateOrganization,
} from "./service"

const organizationRoleModel = t.Union([
  t.Literal("super_admin"),
  t.Literal("admin"),
  t.Literal("member"),
])

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
  role: organizationRoleModel,
  active: t.Boolean(),
  memberCount: t.Number(),
  permissions: permissionsModel,
})

const organizationDetailModel = t.Composite([
  organizationSummaryModel,
  t.Object({
    logo: t.Nullable(t.String()),
    createdAt: t.String(),
    invitationCount: t.Number(),
  }),
])

const memberModel = t.Object({
  id: t.String(),
  userId: t.String(),
  name: t.String(),
  email: t.String(),
  image: t.Nullable(t.String()),
  role: organizationRoleModel,
  createdAt: t.String(),
})

const invitationModel = t.Object({
  id: t.String(),
  email: t.String(),
  role: organizationRoleModel,
  status: t.String(),
  organizationId: t.String(),
  inviterId: t.String(),
  expiresAt: t.String(),
  createdAt: t.String(),
})

export const createOrganizationsModule = (db: Db) =>
  new Elysia({ name: "organizations" })
    .get(
      "/organizations",
      async ({ request }) => {
        const { session, user } = await getSessionContext(request)
        return listOrganizations(db, {
          userId: user.id,
          activeOrganizationId: session.activeOrganizationId,
        })
      },
      {
        response: t.Array(organizationSummaryModel),
      }
    )
    .post(
      "/organizations",
      async ({ body, request }) => {
        const { session, user } = await getSessionContext(request)
        return createOrganization(db, {
          userId: user.id,
          sessionId: session.id,
          name: body.name,
          slug: body.slug,
          keepCurrentActiveOrganization: body.keepCurrentActiveOrganization,
        })
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
          slug: t.String({ minLength: 1 }),
          keepCurrentActiveOrganization: t.Optional(t.Boolean()),
        }),
        response: organizationDetailModel,
      }
    )
    .post(
      "/organizations/:organizationId/activate",
      async ({ params, request }) => {
        const { session, user } = await getSessionContext(request)
        return activateOrganization(db, {
          userId: user.id,
          sessionId: session.id,
          organizationId: params.organizationId,
        })
      },
      {
        params: t.Object({ organizationId: t.String() }),
        response: t.Object({ activeOrganizationId: t.String() }),
      }
    )
    .get(
      "/organizations/:organizationId",
      async ({ params, request }) => {
        const { session, user } = await getSessionContext(request)
        return getOrganization(db, {
          userId: user.id,
          organizationId: params.organizationId,
          activeOrganizationId: session.activeOrganizationId,
        })
      },
      {
        params: t.Object({ organizationId: t.String() }),
        response: organizationDetailModel,
      }
    )
    .patch(
      "/organizations/:organizationId",
      async ({ body, params, request }) => {
        const { user } = await getSessionContext(request)
        return updateOrganization(db, {
          userId: user.id,
          organizationId: params.organizationId,
          name: body.name,
          slug: body.slug,
        })
      },
      {
        params: t.Object({ organizationId: t.String() }),
        body: t.Object({
          name: t.Optional(t.String()),
          slug: t.Optional(t.String()),
        }),
        response: organizationDetailModel,
      }
    )
    .get(
      "/organizations/:organizationId/members",
      async ({ params, request }) => {
        const { user } = await getSessionContext(request)
        return listMembers(db, {
          userId: user.id,
          organizationId: params.organizationId,
        })
      },
      {
        params: t.Object({ organizationId: t.String() }),
        response: t.Array(memberModel),
      }
    )
    .patch(
      "/organizations/:organizationId/members/:memberId",
      async ({ body, params, request }) => {
        const { user } = await getSessionContext(request)
        return updateMemberRole(db, {
          userId: user.id,
          organizationId: params.organizationId,
          memberId: params.memberId,
          role: body.role,
        })
      },
      {
        params: t.Object({
          organizationId: t.String(),
          memberId: t.String(),
        }),
        body: t.Object({ role: organizationRoleModel }),
        response: t.Array(memberModel),
      }
    )
    .delete(
      "/organizations/:organizationId/members/:memberId",
      async ({ params, request }) => {
        const { user } = await getSessionContext(request)
        return removeMember(db, {
          userId: user.id,
          organizationId: params.organizationId,
          memberId: params.memberId,
        })
      },
      {
        params: t.Object({
          organizationId: t.String(),
          memberId: t.String(),
        }),
        response: t.Object({ id: t.String() }),
      }
    )
    .get(
      "/organizations/:organizationId/invitations",
      async ({ params, request }) => {
        const { user } = await getSessionContext(request)
        return listInvitations(db, {
          userId: user.id,
          organizationId: params.organizationId,
        })
      },
      {
        params: t.Object({ organizationId: t.String() }),
        response: t.Array(invitationModel),
      }
    )
    .post(
      "/organizations/:organizationId/invitations",
      async ({ body, params, request }) => {
        const { user } = await getSessionContext(request)
        return createInvitation(db, {
          userId: user.id,
          organizationId: params.organizationId,
          email: body.email,
          role: body.role,
        })
      },
      {
        params: t.Object({ organizationId: t.String() }),
        body: t.Object({
          email: t.String({ format: "email" }),
          role: t.Union([t.Literal("admin"), t.Literal("member")]),
        }),
        response: invitationModel,
      }
    )
    .delete(
      "/organizations/:organizationId/invitations/:invitationId",
      async ({ params, request }) => {
        const { user } = await getSessionContext(request)
        return cancelInvitation(db, {
          userId: user.id,
          organizationId: params.organizationId,
          invitationId: params.invitationId,
        })
      },
      {
        params: t.Object({
          organizationId: t.String(),
          invitationId: t.String(),
        }),
        response: t.Object({ id: t.String(), status: t.String() }),
      }
    )
