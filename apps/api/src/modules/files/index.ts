import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"
import * as v from "valibot"

import { apiErrorModel, tenantErrorResponses } from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import {
  fileDtoModel,
  fileListDtoModel,
  fileListQueryModel,
  fileOwnerParamsModel,
  fileParamsModel,
  filePreviewParamsModel,
  fileUploadBodyModel,
} from "./model"
import {
  downloadFile,
  listFiles,
  previewFile,
  removeFile,
  uploadFile,
} from "./service"

const fileErrorResponses = {
  ...tenantErrorResponses,
  503: apiErrorModel,
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
      async ({ authContext, organizationAccess, params, status }) => {
        await removeFile(db, {
          actorRole: organizationAccess.membership.role,
          actorUserId: authContext.user.id,
          fileId: params.fileId,
          organizationId: organizationAccess.id,
        })
        return status(204, null)
      },
      {
        organizationAccess: {
          action: "file.delete",
          source: "params",
        },
        params: fileParamsModel,
        response: { 204: v.null(), ...fileErrorResponses },
        detail: {
          operationId: "deleteFile",
          summary: "private fileを削除",
          description:
            "uploader本人またはadmin以上がmetadataとquotaをtransactionで削除し、R2 cleanupをqueueする。",
          tags: ["Files"],
        },
      }
    )
