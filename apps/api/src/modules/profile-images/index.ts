import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"
import * as v from "valibot"

import { apiErrorModel, tenantErrorResponses } from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import {
  organizationProfileImageParamsModel,
  profileImageDtoModel,
  profileImageUploadBodyModel,
  userProfileImageParamsModel,
} from "./model"
import {
  readProfileImage,
  removeProfileImage,
  uploadProfileImage,
} from "./service"

const profileImageErrorResponses = {
  ...tenantErrorResponses,
  503: apiErrorModel,
} as const

const binaryResponseModel = v.any()

export const createProfileImagesModule = (db: Db) =>
  new Elysia({ name: "profile-images" })
    .use(createAccessControlModule(db))
    .post(
      "/files/profile-images/users/me",
      async ({ authContext, body, status }) => {
        const subject = { type: "user" as const, id: authContext.user.id }
        const result = await uploadProfileImage(db, {
          actorUserId: authContext.user.id,
          file: body.file,
          fileSize: body.fileSize,
          subject,
          uploadId: body.uploadId,
        })
        return status(result.created ? 201 : 200, result.dto)
      },
      {
        authenticated: true,
        parse: "multipart/form-data",
        body: profileImageUploadBodyModel,
        response: {
          200: profileImageDtoModel,
          201: profileImageDtoModel,
          ...profileImageErrorResponses,
        },
        detail: {
          operationId: "uploadCurrentUserProfileImage",
          summary: "現在のuser profile imageをupload",
          description:
            "1:1のPNGを検証し、512x512 WebPへ正規化してprivate R2へ保存する。",
          tags: ["Profile Images"],
        },
      }
    )
    .delete(
      "/files/profile-images/users/me",
      async ({ authContext }) => {
        await removeProfileImage(db, {
          actorUserId: authContext.user.id,
          subject: { type: "user", id: authContext.user.id },
        })
        return new Response(null, { status: 204 })
      },
      {
        authenticated: true,
        response: {
          204: binaryResponseModel,
          ...profileImageErrorResponses,
        },
        detail: {
          operationId: "deleteCurrentUserProfileImage",
          summary: "現在のuser profile imageを削除",
          description:
            "R2 cleanupをdurable jobへ保存し、upload前のfallback profile imageへ戻す。",
          tags: ["Profile Images"],
        },
      }
    )
    .get(
      "/files/profile-images/users/:userId",
      ({ params, request }) =>
        readProfileImage(db, {
          request,
          subject: { type: "user", id: params.userId },
        }),
      {
        authenticated: true,
        params: userProfileImageParamsModel,
        response: {
          200: binaryResponseModel,
          304: binaryResponseModel,
          ...profileImageErrorResponses,
        },
        detail: {
          operationId: "getUserProfileImage",
          summary: "user profile imageを取得",
          description: "認証後にprivate R2のcanonical WebPをETag付きで返す。",
          tags: ["Profile Images"],
        },
      }
    )
    .post(
      "/files/profile-images/organizations/:organizationId",
      async ({ authContext, body, organizationAccess, status }) => {
        const subject = {
          type: "organization" as const,
          id: organizationAccess.id,
        }
        const result = await uploadProfileImage(db, {
          actorUserId: authContext.user.id,
          file: body.file,
          fileSize: body.fileSize,
          sessionId: authContext.session.id,
          subject,
          uploadId: body.uploadId,
        })
        return status(result.created ? 201 : 200, result.dto)
      },
      {
        organizationAccess: {
          action: "organization.profile_image.update",
          allow: ["super_admin"],
          source: "params",
        },
        parse: "multipart/form-data",
        params: organizationProfileImageParamsModel,
        body: profileImageUploadBodyModel,
        response: {
          200: profileImageDtoModel,
          201: profileImageDtoModel,
          ...profileImageErrorResponses,
        },
        detail: {
          operationId: "uploadOrganizationProfileImage",
          summary: "organization profile imageをupload",
          description:
            "active organizationのsuper adminだけがcanonical WebPを更新できる。",
          tags: ["Profile Images"],
        },
      }
    )
    .delete(
      "/files/profile-images/organizations/:organizationId",
      async ({ authContext, organizationAccess }) => {
        await removeProfileImage(db, {
          actorUserId: authContext.user.id,
          sessionId: authContext.session.id,
          subject: { type: "organization", id: organizationAccess.id },
        })
        return new Response(null, { status: 204 })
      },
      {
        organizationAccess: {
          action: "organization.profile_image.delete",
          allow: ["super_admin"],
          source: "params",
        },
        params: organizationProfileImageParamsModel,
        response: {
          204: binaryResponseModel,
          ...profileImageErrorResponses,
        },
        detail: {
          operationId: "deleteOrganizationProfileImage",
          summary: "organization profile imageを削除",
          description:
            "active organizationのsuper adminだけが削除し、upload前のfallbackへ戻せる。",
          tags: ["Profile Images"],
        },
      }
    )
    .get(
      "/files/profile-images/organizations/:organizationId",
      ({ organizationAccess, request }) =>
        readProfileImage(db, {
          request,
          subject: { type: "organization", id: organizationAccess.id },
        }),
      {
        organizationAccess: {
          action: "organization.profile_image.read",
          requireActive: false,
          source: "params",
        },
        params: organizationProfileImageParamsModel,
        response: {
          200: binaryResponseModel,
          304: binaryResponseModel,
          ...profileImageErrorResponses,
        },
        detail: {
          operationId: "getOrganizationProfileImage",
          summary: "organization profile imageを取得",
          description:
            "対象organizationのmemberへ、active contextに依存せずcanonical WebPを返す。",
          tags: ["Profile Images"],
        },
      }
    )
