import { AppError, publicErrors } from "../../errors/app-error"
import type { OrganizationRole } from "../authorization/public"
import {
  FILE_MAX_BYTES,
  fileObjectKey,
  isPreviewableImageFormat,
  type FileOwnerType,
} from "./constants"
import {
  detectImageFormat,
  type DetectedImageFormat,
  type FileWithOwner,
} from "./file-domain"
import type { FileDto } from "./model"
import type { FileServicePorts } from "./ports"
import {
  type FileR2Object,
  type FileR2ObjectBody,
  type FileStorageRuntime,
} from "./runtime"
import { bodyObject, providerUnavailable } from "./service-runtime"

const normalizeFilename = (value: string) => {
  const filename = value.trim()
  if (filename.length < 1 || filename.length > 255) {
    throw publicErrors.validation("Invalid filename", { field: "file" })
  }
  return filename
}

const normalizeDeclaredContentType = (value: string) => {
  const contentType = value.trim().toLowerCase() || "application/octet-stream"
  if (contentType.length > 255) {
    throw publicErrors.validation("Invalid content type", { field: "file" })
  }
  return contentType
}

const sameUpload = (
  stored: FileWithOwner,
  input: {
    declaredContentType: string
    detectedImageFormat: DetectedImageFormat
    filename: string
    organizationId: string
    ownerId: string
    ownerType: FileOwnerType
    sizeBytes: number
    uploaderId: string
    uploadId: string
  }
) =>
  stored.organizationId === input.organizationId &&
  stored.uploadId === input.uploadId &&
  stored.uploaderId === input.uploaderId &&
  stored.ownerType === input.ownerType &&
  stored.ownerId === input.ownerId &&
  stored.filename === input.filename &&
  stored.sizeBytes === input.sizeBytes &&
  stored.declaredContentType === input.declaredContentType &&
  stored.detectedImageFormat === input.detectedImageFormat

const metadataMatches = (object: FileR2Object, file: FileWithOwner) => {
  const metadata = object.customMetadata
  if (!metadata) return false
  const keys = Object.keys(metadata).toSorted()
  return (
    keys.length === 3 &&
    keys[0] === "expectedSize" &&
    keys[1] === "fileId" &&
    keys[2] === "uploadId" &&
    object.key === file.objectKey &&
    object.size === file.sizeBytes &&
    (file.etag === null || object.etag === file.etag) &&
    metadata.fileId === file.id &&
    metadata.uploadId === file.uploadId &&
    metadata.expectedSize === String(file.sizeBytes)
  )
}

const streamsEqual = async (
  left: ReadableStream<Uint8Array>,
  right: ReadableStream<Uint8Array>
) => {
  const leftReader = left.getReader()
  const rightReader = right.getReader()
  let leftValue: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  let rightValue: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  let leftOffset = 0
  let rightOffset = 0
  let leftDone = false
  let rightDone = false

  try {
    while (true) {
      if (!leftDone && leftOffset === leftValue.byteLength) {
        // oxlint-disable-next-line no-await-in-loop -- 2 streamをchunk境界に依存せず逐次比較する。
        const result = await leftReader.read()
        leftDone = result.done
        leftValue = result.value ?? new Uint8Array(0)
        leftOffset = 0
      }
      if (!rightDone && rightOffset === rightValue.byteLength) {
        // oxlint-disable-next-line no-await-in-loop -- 2 streamをchunk境界に依存せず逐次比較する。
        const result = await rightReader.read()
        rightDone = result.done
        rightValue = result.value ?? new Uint8Array(0)
        rightOffset = 0
      }

      const leftRemaining = leftValue.byteLength - leftOffset
      const rightRemaining = rightValue.byteLength - rightOffset
      if (
        leftDone &&
        rightDone &&
        leftRemaining === 0 &&
        rightRemaining === 0
      ) {
        return true
      }
      if (
        (leftDone && leftRemaining === 0) ||
        (rightDone && rightRemaining === 0)
      ) {
        return false
      }

      const length = Math.min(leftRemaining, rightRemaining)
      for (let index = 0; index < length; index += 1) {
        if (leftValue[leftOffset + index] !== rightValue[rightOffset + index]) {
          return false
        }
      }
      leftOffset += length
      rightOffset += length
    }
  } finally {
    await Promise.allSettled([leftReader.cancel(), rightReader.cancel()])
    leftReader.releaseLock()
    rightReader.releaseLock()
  }
}

const assertUploadContentMatches = async (
  runtime: FileStorageRuntime,
  stored: FileWithOwner,
  upload: File
) => {
  let source: FileR2ObjectBody | null
  try {
    source = bodyObject(await runtime.bucket.get(stored.objectKey))
  } catch {
    throw providerUnavailable("r2", "readUploadRetry")
  }
  if (!source) throw providerUnavailable("r2", "readUploadRetry")

  let matches: boolean
  try {
    matches = await streamsEqual(upload.stream(), source.body)
  } catch {
    throw providerUnavailable("r2", "compareUploadRetry")
  }
  if (!matches) {
    throw publicErrors.conflict("Upload id is already in use", {
      reason: "upload_id_mismatch",
      resource: "file",
    })
  }
}

const normalizeImagesFormat = (value: string): DetectedImageFormat => {
  const format = value
    .trim()
    .toLowerCase()
    .replace(/^image\//u, "")
  if (format === "jpg" || format === "jpeg") return "jpeg"
  if (format === "png") return "png"
  if (format === "webp") return "webp"
  if (format === "gif") return "gif"
  if (format === "avif") return "avif"
  return null
}

const imageMetadata = async (
  runtime: FileStorageRuntime,
  file: FileWithOwner
): Promise<{ imageHeight: number | null; imageWidth: number | null }> => {
  if (!isPreviewableImageFormat(file.detectedImageFormat)) {
    return { imageHeight: null, imageWidth: null }
  }

  let source: FileR2ObjectBody | null
  try {
    source = bodyObject(await runtime.bucket.get(file.objectKey))
  } catch {
    throw providerUnavailable("r2", "readImageForInfo")
  }
  if (!source) {
    throw providerUnavailable("r2", "readImageForInfo")
  }

  try {
    const info = await runtime.images.info(source.body)
    const normalizedFormat = normalizeImagesFormat(info.format)
    if (
      normalizedFormat !== file.detectedImageFormat ||
      typeof info.width !== "number" ||
      !Number.isSafeInteger(info.width) ||
      info.width < 1 ||
      typeof info.height !== "number" ||
      !Number.isSafeInteger(info.height) ||
      info.height < 1 ||
      (info.fileSize !== undefined && info.fileSize !== file.sizeBytes)
    ) {
      throw providerUnavailable("images", "validateImageInfo")
    }
    return { imageHeight: info.height, imageWidth: info.width }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw providerUnavailable("images", "readImageInfo")
  }
}

export const createFileService = (ports: FileServicePorts) => {
  const reconcilePendingUpload = async (input: {
    actorUserId: string
    file: FileWithOwner
    runtime?: FileStorageRuntime
  }): Promise<void> => {
    const runtime = input.runtime ?? ports.getRuntime()
    let object: FileR2Object | null
    try {
      object = await runtime.bucket.head(input.file.objectKey)
    } catch {
      throw providerUnavailable("r2", "headPendingUpload")
    }
    if (!object) {
      throw providerUnavailable("r2", "headPendingUpload")
    }
    if (!metadataMatches(object, input.file)) {
      // 未知のobjectを削除・上書きせず、予約とobjectを残して運用確認へ倒す。
      throw providerUnavailable("r2", "verifyPendingUploadMetadata")
    }
    if (
      typeof object.etag !== "string" ||
      object.etag.length < 1 ||
      object.etag.length > 128
    ) {
      throw providerUnavailable("r2", "verifyPendingUploadEtag")
    }

    const { imageHeight, imageWidth } = await imageMetadata(runtime, input.file)

    await ports.finalizePendingFile({
      actorUserId: input.actorUserId,
      etag: object.etag,
      file: input.file,
      imageHeight,
      imageWidth,
    })
  }

  const uploadFile = async (input: {
    actorRole: OrganizationRole
    actorUserId: string
    file: File
    fileSize: number
    organizationId: string
    ownerId: string
    ownerType: FileOwnerType
    uploadId: string
  }): Promise<{ created: boolean; dto: FileDto }> => {
    if (
      input.fileSize !== input.file.size ||
      input.file.size < 1 ||
      input.file.size > FILE_MAX_BYTES
    ) {
      throw publicErrors.validation("File size does not match", {
        field: "fileSize",
      })
    }

    await ports.assertOwnerUploadable({
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      ownerType: input.ownerType,
    })
    const filename = normalizeFilename(input.file.name)
    const declaredContentType = normalizeDeclaredContentType(input.file.type)
    const detectedImageFormat = await detectImageFormat(input.file)
    const fileId = crypto.randomUUID()
    const reservation = await ports.reservePendingFile({
      declaredContentType,
      detectedImageFormat,
      fileId,
      filename,
      objectKey: fileObjectKey({
        fileId,
        organizationId: input.organizationId,
        ownerId: input.ownerId,
        ownerType: input.ownerType,
      }),
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      ownerType: input.ownerType,
      sizeBytes: input.fileSize,
      uploaderId: input.actorUserId,
      uploadId: input.uploadId,
    })
    if (
      !sameUpload(reservation.file, {
        declaredContentType,
        detectedImageFormat,
        filename,
        organizationId: input.organizationId,
        ownerId: input.ownerId,
        ownerType: input.ownerType,
        sizeBytes: input.fileSize,
        uploaderId: input.actorUserId,
        uploadId: input.uploadId,
      })
    ) {
      throw publicErrors.conflict("Upload id is already in use", {
        reason: "upload_id_mismatch",
        resource: "file",
      })
    }

    if (reservation.file.status === "ready") {
      const runtime = ports.getRuntime()
      let object: FileR2Object | null
      try {
        object = await runtime.bucket.head(reservation.file.objectKey)
      } catch {
        throw providerUnavailable("r2", "headUploadRetry")
      }
      if (!object || !metadataMatches(object, reservation.file)) {
        throw providerUnavailable("r2", "verifyUploadRetry")
      }
      await assertUploadContentMatches(runtime, reservation.file, input.file)
      const ready = await ports.findReadyFileById({
        actorRole: input.actorRole,
        actorUserId: input.actorUserId,
        fileId: reservation.file.id,
        organizationId: input.organizationId,
      })
      if (!ready)
        throw publicErrors.notFound("File not found", { resource: "file" })
      return { created: false, dto: ready.dto }
    }

    const runtime = ports.getRuntime()
    let object: FileR2Object | null
    let wroteObject = false
    try {
      object = await runtime.bucket.head(reservation.file.objectKey)
      if (!object) {
        const onlyIf = new Headers({ "if-none-match": "*" })
        const putObject = await runtime.bucket.put(
          reservation.file.objectKey,
          input.file.stream(),
          {
            onlyIf,
            httpMetadata: { contentType: "application/octet-stream" },
            customMetadata: {
              fileId: reservation.file.id,
              uploadId: reservation.file.uploadId,
              expectedSize: String(reservation.file.sizeBytes),
            },
          }
        )
        wroteObject = putObject !== null
        object =
          putObject ?? (await runtime.bucket.head(reservation.file.objectKey))
      }
    } catch {
      throw providerUnavailable("r2", "putUpload")
    }
    if (!object || !metadataMatches(object, reservation.file)) {
      // onlyIf競合や未知metadataは上書きもcleanupもしない。次回retryも
      // 同じpending rowを検証し、provider/operator側で安全に収束させる。
      throw providerUnavailable("r2", "verifyUploadedObject")
    }
    if (!wroteObject) {
      await assertUploadContentMatches(runtime, reservation.file, input.file)
    }

    await reconcilePendingUpload({
      actorUserId: input.actorUserId,
      file: reservation.file,
      runtime,
    })
    const ready = await ports.findReadyFileById({
      actorRole: input.actorRole,
      actorUserId: input.actorUserId,
      fileId: reservation.file.id,
      organizationId: input.organizationId,
    })
    if (!ready)
      throw publicErrors.notFound("File not found", { resource: "file" })
    return { created: reservation.created, dto: ready.dto }
  }

  return { reconcilePendingUpload, uploadFile }
}

export type FileService = ReturnType<typeof createFileService>
