import { Elysia } from "elysia"
import * as v from "valibot"

import { errorResponseModel, tenantErrorResponses } from "../../models/api"
import type { AccessControlFactory } from "../authorization/public"
import {
  organizationProfileImageParamsModel,
  profileImageDtoModel,
  profileImageUploadBodyModel,
  userProfileImageParamsModel,
} from "./model"
import type { ProfileImageService } from "./service"

const profileImageErrorResponses = {
  ...tenantErrorResponses,
  503: errorResponseModel,
} as const

const binaryResponseModel = v.any()

export const createProfileImageRoutes = (
  service: ProfileImageService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "profile-images" })
    .use(createAccessControl())
    .post(
      "/files/profile-images/users/me",
      async ({ authContext, body, status }) => {
        const subject = { type: "user" as const, id: authContext.user.id }
        const result = await service.uploadProfileImage({
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
          summary: "Upload the current user's profile image",
          description:
            "Validates a square PNG uploaded by the authenticated user, normalizes it to a 512 by 512 WebP, and stores the canonical object in private R2 storage.",
          tags: ["Profile images"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/files/profile-images/users/me",
      async ({ authContext }) => {
        await service.removeProfileImage({
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
          summary: "Delete the current user's profile image",
          description:
            "Removes the authenticated user's canonical profile image, persists private R2 cleanup as a durable job, and restores the configured fallback image.",
          tags: ["Profile images"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/files/profile-images/users/:userId",
      ({ params, request }) =>
        service.readProfileImage({
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
          summary: "Retrieve a user's profile image",
          description:
            "Returns the authorized user's canonical WebP from private R2 storage with an ETag. Conditional requests may receive 304 without exposing an object key or storage URL.",
          tags: ["Profile images"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
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
        const result = await service.uploadProfileImage({
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
          allow: ["owner"],
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
          summary: "Upload an organization profile image",
          description:
            "Allows only the owner of the active organization to replace its canonical profile image after validating and normalizing the uploaded PNG.",
          tags: ["Profile images"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/files/profile-images/organizations/:organizationId",
      async ({ authContext, organizationAccess }) => {
        await service.removeProfileImage({
          actorUserId: authContext.user.id,
          sessionId: authContext.session.id,
          subject: { type: "organization", id: organizationAccess.id },
        })
        return new Response(null, { status: 204 })
      },
      {
        organizationAccess: {
          action: "organization.profile_image.delete",
          allow: ["owner"],
          source: "params",
        },
        params: organizationProfileImageParamsModel,
        response: {
          204: binaryResponseModel,
          ...profileImageErrorResponses,
        },
        detail: {
          operationId: "deleteOrganizationProfileImage",
          summary: "Delete an organization profile image",
          description:
            "Allows only the owner of the active organization to remove its canonical private image, enqueue durable cleanup, and restore the fallback image.",
          tags: ["Profile images"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/files/profile-images/organizations/:organizationId",
      ({ organizationAccess, request }) =>
        service.readProfileImage({
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
          summary: "Retrieve an organization profile image",
          description:
            "Returns a canonical organization WebP to an authenticated member without requiring that organization to be active. Tenant membership is still revalidated before reading private R2.",
          tags: ["Profile images"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
