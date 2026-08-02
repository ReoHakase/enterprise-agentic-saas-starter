import { Elysia } from "elysia"
import * as v from "valibot"

import { errorResponseModel, tenantErrorResponses } from "../../models/api"
import type { AccessControlFactory } from "../authorization/public"
import type { AgentAssetPreviewService } from "./agent-assets-preview-service"
import type { AgentAssetService } from "./agent-assets-service"
import {
  agentAssetDtoModel,
  agentAssetParamsModel,
  agentAssetPreviewParamsModel,
  agentAssetThreadParamsModel,
  agentAssetUploadBodyModel,
  fileDtoModel,
  fileListDtoModel,
  fileListQueryModel,
  fileOwnerParamsModel,
  fileParamsModel,
  filePreviewParamsModel,
  fileUploadBodyModel,
  textFilePreviewDtoModel,
} from "./model"
import type { FileReadService } from "./read-service"
import type { FileService } from "./service"

type FilesRouteService = AgentAssetPreviewService &
  AgentAssetService &
  FileReadService &
  FileService

const fileErrorResponses = {
  ...tenantErrorResponses,
  503: errorResponseModel,
} as const

const agentAssetErrorResponses = {
  ...fileErrorResponses,
  429: errorResponseModel,
} as const

const binaryResponseModel = v.any()

const createFileMutationRoutes = (
  service: FilesRouteService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "file-mutation-routes" })
    .use(createAccessControl())
    .get(
      "/files/organizations/:organizationId/owners/:ownerType/:ownerId",
      ({ authContext, organizationAccess, params, query }) =>
        service.listFiles({
          actorRole: organizationAccess.membership.role,
          actorUserId: authContext.user.id,
          cursor: query.cursor,
          limit: query.limit,
          organizationId: organizationAccess.id,
          ownerId: params.ownerId,
          ownerType: params.ownerType,
        }),
      {
        organizationAccess: {
          action: "file.list",
          source: "params",
        },
        params: fileOwnerParamsModel,
        query: fileListQueryModel,
        response: { 200: fileListDtoModel, ...fileErrorResponses },
        detail: {
          operationId: "listFilesByOwner",
          summary: "List files attached to an owner",
          description:
            "Returns ready files attached to the validated owner in the active organization, ordered newest first with an opaque cursor. Pending and cross-tenant objects are excluded.",
          tags: ["Files"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/files/organizations/:organizationId/owners/:ownerType/:ownerId",
      async ({ authContext, body, organizationAccess, params, status }) => {
        const result = await service.uploadFile({
          actorRole: organizationAccess.membership.role,
          actorUserId: authContext.user.id,
          file: body.file,
          fileSize: body.fileSize,
          organizationId: organizationAccess.id,
          ownerId: params.ownerId,
          ownerType: params.ownerType,
          uploadId: body.uploadId,
        })
        return status(result.created ? 201 : 200, result.dto)
      },
      {
        organizationAccess: {
          action: "file.upload",
          source: "params",
        },
        parse: "multipart/form-data",
        params: fileOwnerParamsModel,
        body: fileUploadBodyModel,
        response: {
          200: fileDtoModel,
          201: fileDtoModel,
          ...fileErrorResponses,
        },
        detail: {
          operationId: "uploadFile",
          summary: "Upload a private tenant file",
          description:
            "Streams one file per request into private R2 storage for a validated owner in the active organization. Repeating the same upload identifier converges on the same committed file.",
          tags: ["Files"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/files/organizations/:organizationId/agent-threads/:threadId/assets",
      async ({ authContext, body, organizationAccess, params, status }) => {
        const result = await service.uploadAgentAsset({
          actorUserId: authContext.user.id,
          file: body.file,
          fileSize: body.fileSize,
          organizationId: organizationAccess.id,
          sessionId: authContext.session.id,
          threadId: params.threadId,
          uploadId: body.uploadId,
        })
        return status(result.created ? 201 : 200, result.dto)
      },
      {
        organizationAccess: {
          action: "agent_asset.upload",
          source: "params",
        },
        parse: "multipart/form-data",
        params: agentAssetThreadParamsModel,
        body: agentAssetUploadBodyModel,
        response: {
          200: agentAssetDtoModel,
          201: agentAssetDtoModel,
          ...agentAssetErrorResponses,
        },
        detail: {
          operationId: "uploadAgentAsset",
          summary: "Upload a temporary Agent image",
          description:
            "Streams one bounded image into the authenticated user's private Agent thread and returns only an opaque asset identifier. The temporary object remains subject to quota and expiry.",
          tags: ["Files", "Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/files/organizations/:organizationId/agent-assets/:assetId/preview/:width",
      ({ authContext, organizationAccess, params, request }) =>
        service.previewAgentAsset({
          actorUserId: authContext.user.id,
          assetId: params.assetId,
          organizationId: organizationAccess.id,
          request,
          sessionId: authContext.session.id,
          width: params.width,
        }),
      {
        organizationAccess: {
          action: "agent_asset.preview",
          source: "params",
        },
        params: agentAssetPreviewParamsModel,
        response: {
          200: binaryResponseModel,
          304: binaryResponseModel,
          ...agentAssetErrorResponses,
        },
        detail: {
          operationId: "previewAgentAsset",
          summary: "Preview a private Agent image",
          description:
            "Returns a WebP preview only after revalidating the active organization, session epoch, and private thread owner. Storage keys and image-optimizer URLs are never disclosed.",
          tags: ["Files", "Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/files/organizations/:organizationId/agent-assets/:assetId",
      async ({ authContext, organizationAccess, params }) => {
        await service.removeAgentAsset({
          actorUserId: authContext.user.id,
          assetId: params.assetId,
          organizationId: organizationAccess.id,
          sessionId: authContext.session.id,
        })
        return new Response(null, { status: 204 })
      },
      {
        organizationAccess: {
          action: "agent_asset.delete",
          source: "params",
        },
        params: agentAssetParamsModel,
        response: {
          204: binaryResponseModel,
          ...agentAssetErrorResponses,
        },
        detail: {
          operationId: "deleteAgentAsset",
          summary: "Delete an unpromoted Agent image",
          description:
            "Deletes a temporary Agent image after fencing active claims and action leases. Quota release and exact-key private R2 cleanup are recorded transactionally for safe retry.",
          tags: ["Files", "Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )

export const createFilesRoutes = (
  service: FilesRouteService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "files" })
    .use(createFileMutationRoutes(service, createAccessControl))
    .get(
      "/files/organizations/:organizationId/:fileId/download",
      ({ authContext, organizationAccess, params, request }) =>
        service.downloadFile({
          actorRole: organizationAccess.membership.role,
          actorUserId: authContext.user.id,
          fileId: params.fileId,
          organizationId: organizationAccess.id,
          request,
        }),
      {
        organizationAccess: {
          action: "file.download",
          source: "params",
        },
        params: fileParamsModel,
        response: {
          200: binaryResponseModel,
          206: binaryResponseModel,
          304: binaryResponseModel,
          416: binaryResponseModel,
          ...fileErrorResponses,
        },
        detail: {
          operationId: "downloadFile",
          summary: "Download a private original file",
          description:
            "Downloads an authorized original file as an attachment from private R2 storage. The endpoint supports one byte range and ETag conditionals without exposing the object key.",
          tags: ["Files"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/files/organizations/:organizationId/:fileId/text-preview",
      async ({ authContext, organizationAccess, params, set }) => {
        const preview = await service.previewTextFile({
          actorRole: organizationAccess.membership.role,
          actorUserId: authContext.user.id,
          fileId: params.fileId,
          organizationId: organizationAccess.id,
        })
        set.headers["cache-control"] = "private, no-store"
        set.headers["cross-origin-resource-policy"] = "same-site"
        set.headers["x-content-type-options"] = "nosniff"
        return preview
      },
      {
        organizationAccess: {
          action: "file.preview",
          source: "params",
        },
        params: fileParamsModel,
        response: {
          200: textFilePreviewDtoModel,
          415: errorResponseModel,
          ...fileErrorResponses,
        },
        detail: {
          operationId: "previewTextFile",
          summary: "Preview an authorized text file",
          description:
            "Reads at most the first one megabyte of an authorized text file, validates UTF-8 content, and returns bounded JSON with no private storage location or raw binary data.",
          tags: ["Files"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/files/organizations/:organizationId/:fileId/preview/:width",
      ({ authContext, organizationAccess, params, request }) =>
        service.previewFile({
          actorRole: organizationAccess.membership.role,
          actorUserId: authContext.user.id,
          fileId: params.fileId,
          organizationId: organizationAccess.id,
          request,
          width: params.width,
        }),
      {
        organizationAccess: {
          action: "file.preview",
          source: "params",
        },
        params: filePreviewParamsModel,
        response: {
          200: binaryResponseModel,
          304: binaryResponseModel,
          ...fileErrorResponses,
        },
        detail: {
          operationId: "previewFile",
          summary: "Preview an authorized image file",
          description:
            "Transforms an authorized private image to WebP at an allowlisted width and uses only an authenticated internal cache. The response never reveals an R2 key or optimizer URL.",
          tags: ["Files"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/files/organizations/:organizationId/:fileId",
      async ({ authContext, organizationAccess, params }) => {
        await service.removeFile({
          actorRole: organizationAccess.membership.role,
          actorUserId: authContext.user.id,
          fileId: params.fileId,
          organizationId: organizationAccess.id,
        })
        return new Response(null, { status: 204 })
      },
      {
        organizationAccess: {
          action: "file.delete",
          source: "params",
        },
        params: fileParamsModel,
        response: { 204: binaryResponseModel, ...fileErrorResponses },
        detail: {
          operationId: "deleteFile",
          summary: "Delete a private tenant file",
          description:
            "Allows the uploader or an organization administrator to delete file metadata and release quota transactionally, then enqueues durable cleanup of the exact private R2 object.",
          tags: ["Files"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
