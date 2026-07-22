import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"
import * as v from "valibot"

import { apiErrorModel, tenantErrorResponses } from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import {
  previewAgentAsset,
  removeAgentAsset,
  uploadAgentAsset,
} from "./agent-assets-service"
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
import {
  downloadFile,
  listFiles,
  previewFile,
  previewTextFile,
  removeFile,
  uploadFile,
} from "./service"

const fileErrorResponses = {
  ...tenantErrorResponses,
  503: apiErrorModel,
} as const

const agentAssetErrorResponses = {
  ...fileErrorResponses,
  429: apiErrorModel,
} as const

const binaryResponseModel = v.any()

export const createFilesModule = (db: Db) =>
  new Elysia({ name: "files" })
    .use(createAccessControlModule(db))
    .get(
      "/files/organizations/:organizationId/owners/:ownerType/:ownerId",
      ({ authContext, organizationAccess, params, query }) =>
        listFiles(db, {
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
          summary: "ownerに属するfileを取得",
          description:
            "active organization内のready fileだけを新しい順のopaque cursorで取得する。",
          tags: ["Files"],
        },
      }
    )
    .post(
      "/files/organizations/:organizationId/owners/:ownerType/:ownerId",
      async ({ authContext, body, organizationAccess, params, status }) => {
        const result = await uploadFile(db, {
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
          summary: "private fileをupload",
          description:
            "1 requestにつき1 fileをR2へstreamし、uploadId retryを同じfileへ収束させる。",
          tags: ["Files"],
        },
      }
    )
    .post(
      "/files/organizations/:organizationId/agent-threads/:threadId/assets",
      async ({ authContext, body, organizationAccess, params, status }) => {
        const result = await uploadAgentAsset(db, {
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
          summary: "Agent chat用の短期画像をupload",
          description:
            "owner private threadへ画像を一度だけstream uploadし、chatにはopaque asset IDだけを返す。",
          tags: ["Files", "Agent"],
        },
      }
    )
    .get(
      "/files/organizations/:organizationId/agent-assets/:assetId/preview/:width",
      ({ authContext, organizationAccess, params, request }) =>
        previewAgentAsset(db, {
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
          summary: "Agent chat画像のprivate previewを取得",
          description:
            "active organization、session epoch、thread ownerを再検証してWebP previewを返す。",
          tags: ["Files", "Agent"],
        },
      }
    )
    .delete(
      "/files/organizations/:organizationId/agent-assets/:assetId",
      async ({ authContext, organizationAccess, params }) => {
        await removeAgentAsset(db, {
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
          summary: "未昇格のAgent chat画像を削除",
          description:
            "live claimとaction leaseをfenceし、quota解放とexact-key R2 cleanupをtransactionへ入れる。",
          tags: ["Files", "Agent"],
        },
      }
    )
    .get(
      "/files/organizations/:organizationId/:fileId/download",
      ({ authContext, organizationAccess, params, request }) =>
        downloadFile(db, {
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
          summary: "private original fileをdownload",
          description:
            "single RangeとETag conditional requestを処理し、常にattachmentとして返す。",
          tags: ["Files"],
        },
      }
    )
    .get(
      "/files/organizations/:organizationId/:fileId/text-preview",
      async ({ authContext, organizationAccess, params, set }) => {
        const preview = await previewTextFile(db, {
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
          415: apiErrorModel,
          ...fileErrorResponses,
        },
        detail: {
          operationId: "previewTextFile",
          summary: "認証付きtext previewを取得",
          description:
            "許可済みtext fileの先頭1 MBをUTF-8として検証し、安全なJSONで返す。",
          tags: ["Files"],
        },
      }
    )
    .get(
      "/files/organizations/:organizationId/:fileId/preview/:width",
      ({ authContext, organizationAccess, params, request }) =>
        previewFile(db, {
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
          summary: "認証付き画像previewを取得",
          description:
            "許可済み幅だけをCloudflare ImagesでWebPへ変換し、認証後の内部cacheを使う。",
          tags: ["Files"],
        },
      }
    )
    .delete(
      "/files/organizations/:organizationId/:fileId",
      async ({ authContext, organizationAccess, params }) => {
        await removeFile(db, {
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
          summary: "private fileを削除",
          description:
            "uploader本人またはadmin以上がmetadataとquotaをtransactionで削除し、R2 cleanupをqueueする。",
          tags: ["Files"],
        },
      }
    )
