import * as v from "valibot"

import { isoTimestampModel, nonEmptyStringModel } from "../../models/common"
import {
  AGENT_ASSET_MAX_BYTES,
  FILE_LIST_DEFAULT_LIMIT,
  FILE_LIST_MAX_LIMIT,
  FILE_MAX_BYTES,
  fileOwnerTypes,
} from "./constants"

const identifierModel = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(255)
)

const fileOwnerTypeModel = v.picklist(fileOwnerTypes)

export const fileOwnerParamsModel = v.strictObject({
  organizationId: identifierModel,
  ownerType: fileOwnerTypeModel,
  ownerId: identifierModel,
})

export const fileParamsModel = v.strictObject({
  organizationId: identifierModel,
  fileId: identifierModel,
})

export const filePreviewParamsModel = v.strictObject({
  organizationId: identifierModel,
  fileId: identifierModel,
  width: nonEmptyStringModel,
})

export const fileListQueryModel = v.strictObject({
  cursor: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(1024))),
  limit: v.optional(
    v.pipe(
      v.union([v.number(), v.string()]),
      v.toNumber(),
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(FILE_LIST_MAX_LIMIT)
    ),
    FILE_LIST_DEFAULT_LIMIT
  ),
})

export const fileUploadBodyModel = v.strictObject({
  uploadId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128)),
  fileSize: v.pipe(
    v.union([v.number(), v.string()]),
    v.toNumber(),
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(FILE_MAX_BYTES)
  ),
  file: v.file(),
})

export const agentAssetThreadParamsModel = v.strictObject({
  organizationId: identifierModel,
  threadId: identifierModel,
})

export const agentAssetParamsModel = v.strictObject({
  organizationId: identifierModel,
  assetId: identifierModel,
})

export const agentAssetPreviewParamsModel = v.strictObject({
  organizationId: identifierModel,
  assetId: identifierModel,
  width: nonEmptyStringModel,
})

export const agentAssetUploadBodyModel = v.strictObject({
  uploadId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128)),
  fileSize: v.pipe(
    v.union([v.number(), v.string()]),
    v.toNumber(),
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(AGENT_ASSET_MAX_BYTES)
  ),
  file: v.file(),
})

export const agentAssetDtoModel = v.object({
  id: nonEmptyStringModel,
  filename: v.string(),
  sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(1)),
  imageWidth: v.pipe(v.number(), v.integer(), v.minValue(1)),
  imageHeight: v.pipe(v.number(), v.integer(), v.minValue(1)),
  previewable: v.literal(true),
  expiresAt: isoTimestampModel,
})

export const fileDtoModel = v.object({
  id: nonEmptyStringModel,
  owner: v.object({
    type: fileOwnerTypeModel,
    id: nonEmptyStringModel,
  }),
  filename: v.string(),
  sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(0)),
  declaredContentType: v.string(),
  previewable: v.boolean(),
  textPreviewable: v.boolean(),
  imageWidth: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  imageHeight: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  uploader: v.object({
    id: nonEmptyStringModel,
    name: v.string(),
    profileImage: v.nullable(v.string()),
  }),
  createdAt: isoTimestampModel,
  canDelete: v.boolean(),
})

export const fileListDtoModel = v.object({
  items: v.array(fileDtoModel),
  nextCursor: v.nullable(v.string()),
})

export const textFilePreviewDtoModel = v.object({
  content: v.string(),
  truncated: v.boolean(),
})

export type FileDto = v.InferOutput<typeof fileDtoModel>
export type FileListDto = v.InferOutput<typeof fileListDtoModel>
export type TextFilePreviewDto = v.InferOutput<typeof textFilePreviewDtoModel>
export type AgentAssetDto = v.InferOutput<typeof agentAssetDtoModel>
