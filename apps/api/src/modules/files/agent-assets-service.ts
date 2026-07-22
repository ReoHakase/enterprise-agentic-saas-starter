import type { Db } from "@enterprise-agentic-saas/db"

import { AppError, publicErrors } from "../../errors/app-error"
import {
  deleteReadyAgentAsset,
  discardPendingAgentAsset,
  finalizePendingAgentAsset,
  findAgentRunAssetForModel,
  findReadyAgentAssetForSession,
  reservePendingAgentAsset,
  toAgentAssetDto,
  type AgentAssetWithStorage,
} from "./agent-assets-repository"
import {
  AGENT_ASSET_MAX_BYTES,
  AGENT_ASSET_MAX_DIMENSION,
  AGENT_ASSET_MAX_PIXELS,
  AGENT_ASSET_MODEL_MAX_BYTES,
  AGENT_ASSET_MODEL_MAX_EDGE,
  FILE_PREVIEW_WIDTHS,
  agentAssetObjectKey,
  type FilePreviewWidth,
  type PreviewableImageFormat,
} from "./constants"
import type { AgentAssetDto } from "./model"
import {
  getFileStorageRuntime,
  type FileR2Object,
  type FileR2ObjectBody,
  type FileStorageRuntime,
} from "./runtime"
import { detectImageFormat } from "./service"

const providerUnavailable = (
  provider: "images" | "r2" | "runtime",
  operation: string
) =>
  new AppError({
    code: "service_unavailable",
    publicMessage: "Service temporarily unavailable",
    statusCode: 503,
    publicContext: { retryAfter: 30 },
    privateContext: { module: "agent-assets", operation, provider },
  })

const agentAssetUploadDisabled = () =>
  new AppError({
    code: "service_unavailable",
    publicMessage: "Service temporarily unavailable",
    statusCode: 503,
    publicContext: {
      reason: "feature_disabled",
      resource: "agent_asset",
      retryAfter: 30,
    },
    privateContext: {
      feature: "agent_asset_upload",
      module: "agent-assets",
      operation: "uploadAgentAsset",
    },
  })

const getRuntime = (): FileStorageRuntime => {
  try {
    return getFileStorageRuntime()
  } catch {
    throw providerUnavailable("runtime", "getFileStorageRuntime")
  }
}

const bodyObject = (
  object: FileR2Object | FileR2ObjectBody | null
): FileR2ObjectBody | null =>
  object && "body" in object && object.body instanceof ReadableStream
    ? object
    : null

const normalizeFilename = (value: string) => {
  const filename = value.trim()
  if (filename.length < 1 || filename.length > 255) {
    throw publicErrors.validation("Invalid filename", { field: "file" })
  }
  return filename
}

const imageContentTypes: Record<PreviewableImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

const requireSupportedAgentImage = async (file: File) => {
  const detected = await detectImageFormat(file)
  if (
    detected !== "jpeg" &&
    detected !== "png" &&
    detected !== "webp" &&
    detected !== "gif"
  ) {
    throw publicErrors.validation("Only JPEG, PNG, WebP, or GIF is allowed", {
      field: "file",
      reason: "unsupported_image",
    })
  }
  const declaredContentType = file.type.trim().toLowerCase()
  if (declaredContentType !== imageContentTypes[detected]) {
    throw publicErrors.validation("Image content type does not match", {
      field: "file",
      reason: "content_type_mismatch",
    })
  }
  return { declaredContentType, detectedImageFormat: detected }
}

const sameUpload = (
  value: AgentAssetWithStorage,
  input: {
    declaredContentType: string
    detectedImageFormat: PreviewableImageFormat
    filename: string
    organizationId: string
    sessionId: string
    sizeBytes: number
    threadId: string
    uploadId: string
    uploaderId: string
  }
) =>
  value.asset.organizationId === input.organizationId &&
  value.asset.sessionId === input.sessionId &&
  value.asset.threadId === input.threadId &&
  value.asset.uploaderId === input.uploaderId &&
  value.asset.filename === input.filename &&
  value.storage.organizationId === input.organizationId &&
  value.storage.uploaderId === input.uploaderId &&
  value.storage.uploadId === input.uploadId &&
  value.storage.sizeBytes === input.sizeBytes &&
  value.storage.declaredContentType === input.declaredContentType &&
  value.storage.detectedImageFormat === input.detectedImageFormat &&
  value.claim?.holderType === "agent_asset" &&
  value.claim.holderId === value.asset.id &&
  value.claim.storageObjectId === value.storage.id

const metadataMatches = (
  object: FileR2Object,
  value: AgentAssetWithStorage
) => {
  const metadata = object.customMetadata
  if (!metadata) return false
  const keys = Object.keys(metadata).toSorted()
  return (
    keys.length === 4 &&
    keys[0] === "agentAssetId" &&
    keys[1] === "expectedSize" &&
    keys[2] === "storageObjectId" &&
    keys[3] === "uploadId" &&
    object.key === value.storage.objectKey &&
    object.size === value.storage.sizeBytes &&
    (value.storage.etag === null || object.etag === value.storage.etag) &&
    metadata.agentAssetId === value.asset.id &&
    metadata.storageObjectId === value.storage.id &&
    metadata.uploadId === value.storage.uploadId &&
    metadata.expectedSize === String(value.storage.sizeBytes)
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
        // oxlint-disable-next-line no-await-in-loop -- chunk境界に依存せず2 streamを比較する。
        const result = await leftReader.read()
        leftDone = result.done
        leftValue = result.value ?? new Uint8Array(0)
        leftOffset = 0
      }
      if (!rightDone && rightOffset === rightValue.byteLength) {
        // oxlint-disable-next-line no-await-in-loop -- chunk境界に依存せず2 streamを比較する。
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
  value: AgentAssetWithStorage,
  upload: File
) => {
  if (!value.storage.objectKey) {
    throw providerUnavailable("r2", "readAgentAssetRetry")
  }
  let source: FileR2ObjectBody | null
  try {
    source = bodyObject(await runtime.bucket.get(value.storage.objectKey))
  } catch {
    throw providerUnavailable("r2", "readAgentAssetRetry")
  }
  if (!source) throw providerUnavailable("r2", "readAgentAssetRetry")
  let matches: boolean
  try {
    matches = await streamsEqual(upload.stream(), source.body)
  } catch {
    throw providerUnavailable("r2", "compareAgentAssetRetry")
  }
  if (!matches) {
    throw publicErrors.conflict("Upload id is already in use", {
      reason: "upload_id_mismatch",
      resource: "agent_asset",
    })
  }
}

const normalizeImagesFormat = (
  value: string
): PreviewableImageFormat | null => {
  const format = value
    .trim()
    .toLowerCase()
    .replace(/^image\//u, "")
  if (format === "jpg" || format === "jpeg") return "jpeg"
  if (format === "png") return "png"
  if (format === "webp") return "webp"
  if (format === "gif") return "gif"
  return null
}

const readImageMetadata = async (
  runtime: FileStorageRuntime,
  value: AgentAssetWithStorage
) => {
  if (!value.storage.objectKey) {
    throw providerUnavailable("r2", "readAgentAssetInfo")
  }
  let source: FileR2ObjectBody | null
  try {
    source = bodyObject(await runtime.bucket.get(value.storage.objectKey))
  } catch {
    throw providerUnavailable("r2", "readAgentAssetInfo")
  }
  if (!source) throw providerUnavailable("r2", "readAgentAssetInfo")
  try {
    const info = await runtime.images.info(source.body)
    const format = normalizeImagesFormat(info.format)
    if (format !== value.storage.detectedImageFormat) {
      throw publicErrors.validation("Image signature does not match", {
        field: "file",
        reason: "image_signature_mismatch",
      })
    }
    if (
      typeof info.width !== "number" ||
      !Number.isSafeInteger(info.width) ||
      info.width < 1 ||
      typeof info.height !== "number" ||
      !Number.isSafeInteger(info.height) ||
      info.height < 1
    ) {
      throw providerUnavailable("images", "validateAgentAssetInfo")
    }
    if (
      info.width > AGENT_ASSET_MAX_DIMENSION ||
      info.height > AGENT_ASSET_MAX_DIMENSION ||
      info.width * info.height > AGENT_ASSET_MAX_PIXELS
    ) {
      throw publicErrors.validation("Image dimensions are too large", {
        field: "file",
        reason: "image_dimensions_exceeded",
      })
    }
    if (
      info.fileSize !== undefined &&
      info.fileSize !== value.storage.sizeBytes
    ) {
      throw providerUnavailable("images", "validateAgentAssetSize")
    }
    return { imageHeight: info.height, imageWidth: info.width }
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    throw providerUnavailable("images", "readAgentAssetInfo")
  }
}

const cleanupRejectedUpload = async (
  db: Db,
  value: AgentAssetWithStorage,
  cause: unknown
): Promise<never> => {
  try {
    await discardPendingAgentAsset(db, {
      assetId: value.asset.id,
      expectedClaimRevision: value.claim?.revision ?? -1,
      expectedStorageCleanupRevision: value.storage.cleanupRevision,
      organizationId: value.asset.organizationId,
    })
  } catch {
    // 期限cleanupが同じexact-key fenceへ収束する。provider/input詳細は記録しない。
  }
  throw cause
}

export const reconcilePendingAgentAsset = async (
  db: Db,
  input: {
    value: AgentAssetWithStorage
    runtime?: FileStorageRuntime
  }
) => {
  const runtime = input.runtime ?? getRuntime()
  if (!input.value.storage.objectKey) {
    throw providerUnavailable("r2", "headPendingAgentAsset")
  }
  let object: FileR2Object | null
  try {
    object = await runtime.bucket.head(input.value.storage.objectKey)
  } catch {
    throw providerUnavailable("r2", "headPendingAgentAsset")
  }
  if (!object || !metadataMatches(object, input.value)) {
    throw providerUnavailable("r2", "verifyPendingAgentAsset")
  }
  if (
    typeof object.etag !== "string" ||
    object.etag.length < 1 ||
    object.etag.length > 128
  ) {
    throw providerUnavailable("r2", "verifyPendingAgentAssetEtag")
  }

  let dimensions: { imageHeight: number; imageWidth: number }
  try {
    dimensions = await readImageMetadata(runtime, input.value)
  } catch (cause) {
    if (cause instanceof AppError && cause.statusCode < 500) {
      return cleanupRejectedUpload(db, input.value, cause)
    }
    throw cause
  }
  try {
    return await finalizePendingAgentAsset(db, {
      assetId: input.value.asset.id,
      etag: object.etag,
      imageHeight: dimensions.imageHeight,
      imageWidth: dimensions.imageWidth,
      organizationId: input.value.asset.organizationId,
    })
  } catch (cause) {
    if (cause instanceof AppError && cause.statusCode < 500) {
      return cleanupRejectedUpload(db, input.value, cause)
    }
    throw cause
  }
}

export const uploadAgentAsset = async (
  db: Db,
  input: {
    actorUserId: string
    file: File
    fileSize: number
    organizationId: string
    sessionId: string
    threadId: string
    uploadId: string
  }
): Promise<{ created: boolean; dto: AgentAssetDto }> => {
  const runtime = getRuntime()
  if (runtime.agentAssetUploadEnabled !== true) {
    throw agentAssetUploadDisabled()
  }
  if (
    input.fileSize !== input.file.size ||
    input.file.size < 1 ||
    input.file.size > AGENT_ASSET_MAX_BYTES
  ) {
    throw publicErrors.validation("File size does not match", {
      field: "fileSize",
    })
  }
  const filename = normalizeFilename(input.file.name)
  const image = await requireSupportedAgentImage(input.file)
  const assetId = crypto.randomUUID()
  const storageObjectId = crypto.randomUUID()
  const reservation = await reservePendingAgentAsset(db, {
    assetId,
    declaredContentType: image.declaredContentType,
    detectedImageFormat: image.detectedImageFormat,
    filename,
    objectKey: agentAssetObjectKey({
      organizationId: input.organizationId,
      storageObjectId,
    }),
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    sizeBytes: input.fileSize,
    storageObjectId,
    threadId: input.threadId,
    uploadId: input.uploadId,
    uploaderId: input.actorUserId,
  })
  if (
    !sameUpload(reservation.value, {
      ...image,
      filename,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      sizeBytes: input.fileSize,
      threadId: input.threadId,
      uploadId: input.uploadId,
      uploaderId: input.actorUserId,
    })
  ) {
    throw publicErrors.conflict("Upload id is already in use", {
      reason: "upload_id_mismatch",
      resource: "agent_asset",
    })
  }

  if (reservation.value.asset.status === "ready") {
    if (!reservation.value.storage.objectKey) {
      throw providerUnavailable("r2", "headAgentAssetRetry")
    }
    let object: FileR2Object | null
    try {
      object = await runtime.bucket.head(reservation.value.storage.objectKey)
    } catch {
      throw providerUnavailable("r2", "headAgentAssetRetry")
    }
    if (!object || !metadataMatches(object, reservation.value)) {
      throw providerUnavailable("r2", "verifyAgentAssetRetry")
    }
    await assertUploadContentMatches(runtime, reservation.value, input.file)
    const ready = await findReadyAgentAssetForSession(db, {
      assetId: reservation.value.asset.id,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      userId: input.actorUserId,
    })
    return { created: false, dto: toAgentAssetDto(ready) }
  }
  if (reservation.value.asset.status !== "pending") {
    throw publicErrors.conflict("Upload id is no longer reusable", {
      reason: "upload_expired",
      resource: "agent_asset",
    })
  }
  if (!reservation.value.storage.objectKey) {
    throw providerUnavailable("r2", "putAgentAsset")
  }

  let object: FileR2Object | null
  let wroteObject = false
  try {
    object = await runtime.bucket.head(reservation.value.storage.objectKey)
    if (!object) {
      const putObject = await runtime.bucket.put(
        reservation.value.storage.objectKey,
        input.file.stream(),
        {
          onlyIf: new Headers({ "if-none-match": "*" }),
          httpMetadata: { contentType: "application/octet-stream" },
          customMetadata: {
            agentAssetId: reservation.value.asset.id,
            expectedSize: String(reservation.value.storage.sizeBytes),
            storageObjectId: reservation.value.storage.id,
            uploadId: reservation.value.storage.uploadId,
          },
          storageClass: "Standard",
        }
      )
      wroteObject = putObject !== null
      object =
        putObject ??
        (await runtime.bucket.head(reservation.value.storage.objectKey))
    }
  } catch {
    throw providerUnavailable("r2", "putAgentAsset")
  }
  if (!object || !metadataMatches(object, reservation.value)) {
    throw providerUnavailable("r2", "verifyAgentAssetObject")
  }
  if (!wroteObject) {
    await assertUploadContentMatches(runtime, reservation.value, input.file)
  }

  const ready = await reconcilePendingAgentAsset(db, {
    value: reservation.value,
    runtime,
  })
  return { created: reservation.created, dto: toAgentAssetDto(ready) }
}

const privateImageHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-cache",
    "Content-Type": "image/webp",
    "Cross-Origin-Resource-Policy": "same-site",
    "X-Content-Type-Options": "nosniff",
  })

const httpEtag = (etag: string) =>
  etag.startsWith('"') && etag.endsWith('"') ? etag : `"${etag}"`

const matchesIfNoneMatch = (value: string | null, etag: string) =>
  value
    ?.split(",")
    .map((candidate) => candidate.trim().replace(/^W\//u, ""))
    .some((candidate) => candidate === "*" || candidate === etag) ?? false

const previewVariantEtag = async (
  sourceEtag: string,
  width: FilePreviewWidth
) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${sourceEtag}:${width}:webp:q75:anim0:agent-preview-v1`
    )
  )
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  return `"${hex}"`
}

const previewCacheKey = (
  request: Request,
  input: {
    assetId: string
    organizationId: string
    sourceEtag: string
    width: FilePreviewWidth
  }
) => {
  const url = new URL(request.url)
  url.pathname = `/__agent_asset_preview_cache/organizations/${encodeURIComponent(input.organizationId)}/assets/${encodeURIComponent(input.assetId)}/${input.width}`
  url.search = new URLSearchParams({
    source: input.sourceEtag,
    variant: "webp:q75:anim0:agent-preview-v1",
  }).toString()
  return new Request(url, { method: "GET" })
}

const browserPreviewResponse = (response: Response, etag: string) => {
  const headers = privateImageHeaders()
  headers.set("ETag", etag)
  const contentLength = response.headers.get("content-length")
  if (contentLength) headers.set("Content-Length", contentLength)
  return new Response(response.body, { status: 200, headers })
}

const transformAgentImage = async (
  runtime: FileStorageRuntime,
  value: AgentAssetWithStorage,
  width: number
) => {
  if (!value.storage.objectKey || !value.storage.etag) {
    throw providerUnavailable("r2", "readAgentAssetImage")
  }
  try {
    const source = bodyObject(
      await runtime.bucket.get(value.storage.objectKey, {
        onlyIf: new Headers({ "if-match": httpEtag(value.storage.etag) }),
      })
    )
    if (!source) throw providerUnavailable("r2", "readAgentAssetImage")
    const result = await runtime.images
      .input(source.body)
      .transform({ width, fit: "scale-down" })
      .output({ format: "image/webp", quality: 75, anim: false })
    const response = result.response()
    if (!response.ok || !response.body) {
      throw providerUnavailable("images", "transformAgentAsset")
    }
    return response
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    throw providerUnavailable("images", "transformAgentAsset")
  }
}

export const previewAgentAsset = async (
  db: Db,
  input: {
    actorUserId: string
    assetId: string
    organizationId: string
    request: Request
    sessionId: string
    width: string
  }
) => {
  const width = FILE_PREVIEW_WIDTHS.find(
    (candidate) => String(candidate) === input.width
  )
  if (width === undefined) {
    throw publicErrors.validation("Unsupported preview width", {
      field: "width",
    })
  }
  const value = await findReadyAgentAssetForSession(db, {
    assetId: input.assetId,
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    userId: input.actorUserId,
  })
  if (!value.storage.etag) {
    throw providerUnavailable("r2", "readAgentAssetPreviewMetadata")
  }
  const etag = await previewVariantEtag(value.storage.etag, width)
  if (matchesIfNoneMatch(input.request.headers.get("if-none-match"), etag)) {
    const headers = privateImageHeaders()
    headers.set("ETag", etag)
    return new Response(null, { status: 304, headers })
  }

  const runtime = getRuntime()
  const key = previewCacheKey(input.request, {
    assetId: value.asset.id,
    organizationId: input.organizationId,
    sourceEtag: value.storage.etag,
    width,
  })
  if (runtime.cache) {
    try {
      const cached = await runtime.cache.match(key)
      if (cached) return browserPreviewResponse(cached, etag)
    } catch {
      // Cache障害でも認可済みrequestはR2 + Imagesへfail-openする。
    }
  }

  const transformed = await transformAgentImage(runtime, value, width)
  if (runtime.cache) {
    const cacheTtlSeconds = Math.max(
      1,
      Math.min(
        3 * 24 * 60 * 60,
        Math.floor((value.asset.expiresAt.getTime() - Date.now()) / 1000)
      )
    )
    const cacheHeaders = new Headers(transformed.headers)
    cacheHeaders.delete("Set-Cookie")
    cacheHeaders.set("Cache-Control", `public, max-age=${cacheTtlSeconds}`)
    cacheHeaders.set("Content-Type", "image/webp")
    cacheHeaders.set("ETag", etag)
    const cacheResponse = new Response(transformed.clone().body, {
      status: 200,
      headers: cacheHeaders,
    })
    const write = runtime.cache.put(key, cacheResponse).catch(() => undefined)
    if (runtime.defer) runtime.defer(write)
    else await write
  }
  return browserPreviewResponse(transformed, etag)
}

const readBoundedImage = async (
  body: ReadableStream<Uint8Array>,
  maximumBytes: number
) => {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (byteLength <= maximumBytes) {
      // oxlint-disable-next-line no-await-in-loop -- unknown-length Images outputを上限+1でfenceする。
      const result = await reader.read()
      if (result.done) break
      byteLength += result.value.byteLength
      if (byteLength > maximumBytes) {
        throw publicErrors.validation("Image is too large for model input", {
          resource: "agent_asset",
          reason: "model_image_too_large",
        })
      }
      chunks.push(result.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export const getAgentImageForModel = async (
  db: Db,
  input: { grant: string; assetId: string }
): Promise<Response> => {
  const access = await findAgentRunAssetForModel(db, input)
  const transformed = await transformAgentImage(
    getRuntime(),
    access,
    AGENT_ASSET_MODEL_MAX_EDGE
  )
  const declaredLength = Number(transformed.headers.get("content-length"))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > AGENT_ASSET_MODEL_MAX_BYTES
  ) {
    await transformed.body?.cancel().catch(() => undefined)
    throw publicErrors.validation("Image is too large for model input", {
      resource: "agent_asset",
      reason: "model_image_too_large",
    })
  }
  const outputContentType = transformed.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
  if (outputContentType !== "image/webp") {
    await transformed.body?.cancel().catch(() => undefined)
    throw providerUnavailable("images", "validateAgentAssetOutputType")
  }
  if (!transformed.body) {
    throw providerUnavailable("images", "readAgentAssetOutput")
  }
  const bytes = await readBoundedImage(
    transformed.body,
    AGENT_ASSET_MODEL_MAX_BYTES
  )
  const headers = privateImageHeaders()
  headers.set("Cache-Control", "private, no-store")
  headers.set("Content-Length", String(bytes.byteLength))
  return new Response(new Blob([bytes], { type: "image/webp" }), {
    status: 200,
    headers,
  })
}

export const removeAgentAsset = async (
  db: Db,
  input: {
    actorUserId: string
    assetId: string
    organizationId: string
    sessionId: string
  }
) => {
  const deleted = await deleteReadyAgentAsset(db, {
    assetId: input.assetId,
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    userId: input.actorUserId,
  })
  if (!deleted) {
    throw publicErrors.notFound("Agent asset not found", {
      resource: "agent_asset",
    })
  }
}
