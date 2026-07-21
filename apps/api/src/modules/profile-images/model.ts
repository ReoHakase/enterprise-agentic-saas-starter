import * as v from "valibot"

import { isoTimestampModel, nonEmptyStringModel } from "../../models/common"
import { PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SOURCE_MAX_BYTES } from "./constants"

const identifierModel = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(255)
)

export const userProfileImageParamsModel = v.strictObject({
  userId: identifierModel,
})

export const organizationProfileImageParamsModel = v.strictObject({
  organizationId: identifierModel,
})

export const profileImageUploadBodyModel = v.strictObject({
  uploadId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128)),
  fileSize: v.pipe(
    v.union([v.number(), v.string()]),
    v.toNumber(),
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(PROFILE_IMAGE_SOURCE_MAX_BYTES)
  ),
  file: v.file(),
})

export const profileImageDtoModel = v.object({
  id: nonEmptyStringModel,
  profileImage: nonEmptyStringModel,
  width: v.literal(PROFILE_IMAGE_SIZE),
  height: v.literal(PROFILE_IMAGE_SIZE),
  updatedAt: isoTimestampModel,
})

export type ProfileImageDto = v.InferOutput<typeof profileImageDtoModel>
export type ProfileImageUploadBody = v.InferOutput<
  typeof profileImageUploadBodyModel
>
