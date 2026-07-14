import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"

import {
  authenticatedErrorResponses,
  tenantErrorResponses,
} from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import { createOrganizationDeletionAccessModule } from "./deletion-access"
import {
  activateOrganizationResponseModel,
  canceledInvitationResponseModel,
  createInvitationBodyModel,
  createOrganizationBodyModel,
  deleteOrganizationBodyModel,
  deleteOrganizationResponseModel,
  idResponseModel,
  invitationListModel,
  invitationModel,
  memberListModel,
  organizationDetailModel,
  organizationIdParamsModel,
  organizationInvitationParamsModel,
  organizationListModel,
  organizationMemberParamsModel,
  removeMemberBodyModel,
  transferSuperAdminBodyModel,
  updateMemberRoleBodyModel,
  updateOrganizationBodyModel,
} from "./model"
import {
  activateOrganization,
  cancelInvitation,
  createInvitation,
  createOrganization,
  deleteOrganization,
  getOrganization,
  listInvitations,
  listMembers,
  listOrganizations,
  removeMember,
  transferSuperAdmin,
  updateMemberRole,
  updateOrganization,
} from "./service"

export const createOrganizationsModule = (db: Db) =>
  new Elysia({ name: "organizations" })
    .use(createAccessControlModule(db))
    .use(createOrganizationDeletionAccessModule(db))
    .get(
      "/organizations",
      async ({ authContext: { session, user } }) =>
        listOrganizations(db, {
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
          summary: "所属organization一覧を取得",
          description:
            "認証userが所属するorganizationだけを返す。他tenantは列挙しない。",
          tags: ["Organizations"],
        },
      }
    )
    .post(
      "/organizations",
      async ({ authContext: { session, user }, body, status }) =>
        status(
          201,
          await createOrganization(db, {
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
          summary: "organizationを作成",
          description:
            "作成者を唯一のsuper_adminとして登録し、既定では作成したorganizationをactiveにする。",
          tags: ["Organizations"],
        },
      }
    )
    .post(
      "/organizations/:organizationId/activate",
      async ({ authContext: { session, user }, organizationAccess }) =>
        activateOrganization(db, {
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
          summary: "active organizationを切り替え",
          description:
            "所属確認後に現在のsessionだけを切り替える。別accountや別sessionのcontextは変更しない。",
          tags: ["Organizations"],
        },
      }
    )
    .get(
      "/organizations/:organizationId",
      async ({ authContext: { session, user }, organizationAccess }) =>
        getOrganization(db, {
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
          summary: "active organization詳細を取得",
          description:
            "active organizationと一致し、現在のuserが所属するorganizationの詳細だけを返す。",
          tags: ["Organizations"],
        },
      }
    )
    .patch(
      "/organizations/:organizationId",
      async ({ authContext: { user }, body, organizationAccess }) =>
        updateOrganization(db, {
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
          summary: "organization設定を更新",
          description: "active organizationのsuper_adminだけが実行できる。",
          tags: ["Organizations"],
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

        return deleteOrganization(db, {
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
          summary: "organizationを即時削除",
          description:
            "active organizationのsuper_adminがfresh session、slug完全一致、DELETE確認、冪等性keyを提示した場合だけ実行する。tenant dataはtransaction内で即時削除し、R2 attachmentはdurable background jobで再試行する。同じuser・organization・keyの再送は同じreceiptを返す。",
          tags: ["Organizations"],
        },
      }
    )
    .get(
      "/organizations/:organizationId/members",
      async ({ authContext: { user }, organizationAccess }) =>
        listMembers(db, {
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
          summary: "member一覧を取得",
          description:
            "検証済みorganization scope内のmemberとeffective roleを返す。",
          tags: ["Organization members"],
        },
      }
    )
    .patch(
      "/organizations/:organizationId/members/:memberId",
      async ({ authContext, body, organizationAccess, params }) =>
        updateMemberRole(db, {
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
          summary: "member roleを変更",
          description:
            "fresh sessionを持つsuper_admin専用。super_admin移管はownership transfer endpointを使う。",
          tags: ["Organization members"],
        },
      }
    )
    .post(
      "/organizations/:organizationId/ownership-transfer",
      async ({ authContext, body, organizationAccess }) =>
        transferSuperAdmin(db, {
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
          summary: "super_adminを移管",
          description:
            "fresh sessionと対象member emailの完全一致確認を要求する。transaction内で移管し、完了時にsuper_adminが必ず一人になる。",
          tags: ["Organization members"],
        },
      }
    )
    .delete(
      "/organizations/:organizationId/members/:memberId",
      async ({ authContext, body, organizationAccess, params }) =>
        removeMember(db, {
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
          summary: "memberを削除",
          description:
            "fresh sessionと対象member emailの完全一致確認を要求する。adminはmemberだけを削除できる。",
          tags: ["Organization members"],
        },
      }
    )
    .get(
      "/organizations/:organizationId/invitations",
      async ({ authContext: { user }, organizationAccess }) =>
        listInvitations(db, {
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
          summary: "招待一覧を取得",
          description:
            "admin以上に、検証済みorganization scope内の招待と期限状態を返す。",
          tags: ["Organization invitations"],
        },
      }
    )
    .post(
      "/organizations/:organizationId/invitations",
      async ({ authContext, body, organizationAccess, status }) =>
        status(
          201,
          await createInvitation(db, {
            userId: authContext.user.id,
            inviterName: authContext.user.name,
            session: authContext.session,
            organizationId: organizationAccess.id,
            email: body.email,
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
        response: { 201: invitationModel, ...tenantErrorResponses },
        detail: {
          operationId: "createOrganizationInvitation",
          summary: "memberを招待",
          description:
            "adminはmemberだけを招待できる。admin roleの付与はfresh sessionを持つsuper_adminだけに許可し、super_admin roleは招待では付与できない。",
          tags: ["Organization invitations"],
        },
      }
    )
    .delete(
      "/organizations/:organizationId/invitations/:invitationId",
      async ({ authContext: { user }, organizationAccess, params }) =>
        cancelInvitation(db, {
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
          summary: "pending招待を取消",
          description:
            "期限内のpending招待だけを取消し、terminal stateの上書きや他tenantの参照を拒否する。",
          tags: ["Organization invitations"],
        },
      }
    )
