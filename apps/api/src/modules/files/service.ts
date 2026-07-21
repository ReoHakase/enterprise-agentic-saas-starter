import type { Db } from "@enterprise-agentic-saas/db"

import { AppError, publicErrors } from "../../errors/app-error"
import type { OrganizationRole } from "../authorization/roles"
import {
  FILE_PREVIEW_WIDTHS,
  FILE_MAX_BYTES,
  FILE_TEXT_PREVIEW_MAX_BYTES,
  fileObjectKey,
  isPreviewableImageFormat,
  isTextPreviewableFile,
  type FileOwnerType,
  type FilePreviewWidth,
  type PreviewableImageFormat,
} from "./constants"
import type { FileDto, FileListDto, TextFilePreviewDto } from "./model"
import { getFileOwnerAdapter } from "./owner-adapters"
import {
  deleteReadyFile,
  finalizePendingFile,
  findReadyFileById,
  listReadyFilesByOwner,
  reservePendingFile,
  type FileWithOwner,
} from "./repository"
import {
  getFileStorageRuntime,
  type FileR2Object,
  type FileR2ObjectBody,
  type FileStorageRuntime,
} from "./runtime"

type DetectedImageFormat = PreviewableImageFormat | "avif" | null

const providerUnavailable = (
  provider: "images" | "r2" | "runtime",
  operation: string
) =>
  new AppError({
    code: "service_unavailable",
    publicMessage: "Service temporarily unavailable",
    statusCode: 503,
    publicContext: { retryAfter: 30 },
    privateContext: { module: "files", operation, provider },
  })

const getRuntime = (): FileStorageRuntime => {
  try {
    return getFileStorageRuntime()
  } catch {
    throw providerUnavailable("runtime", "getFileStorageRuntime")
  }
}

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

const startsWith = (bytes: Uint8Array, expected: readonly number[]) =>
  expected.every((byte, index) => bytes[index] === byte)

export const detectImageFormat = async (
  file: Blob
): Promise<DetectedImageFormat> => {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg"
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png"
  }
  const ascii = new TextDecoder("ascii").decode(bytes)
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "gif"
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp"
  if (
    ascii.slice(4, 8) === "ftyp" &&
    (ascii.slice(8, 12) === "avif" || ascii.slice(8, 12) === "avis")
  ) {
    return "avif"
  }
  return null
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

const bodyObject = (
  object: FileR2Object | FileR2ObjectBody | null
): FileR2ObjectBody | null =>
  object && "body" in object && object.body instanceof ReadableStream
    ? object
    : null

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

export const reconcilePendingUpload = async (
  db: Db,
  input: {
    actorUserId: string
    file: FileWithOwner
    runtime?: FileStorageRuntime
  }
): Promise<void> => {
  const runtime = input.runtime ?? getRuntime()
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

  await finalizePendingFile(db, {
    actorUserId: input.actorUserId,
    etag: object.etag,
    fileId: input.file.id,
    imageHeight,
    imageWidth,
    organizationId: input.file.organizationId,
  })
}

export const uploadFile = async (
  db: Db,
  input: {
    actorRole: OrganizationRole
    actorUserId: string
    file: File
    fileSize: number
    organizationId: string
    ownerId: string
    ownerType: FileOwnerType
    uploadId: string
  }
): Promise<{ created: boolean; dto: FileDto }> => {
  if (
    input.fileSize !== input.file.size ||
    input.file.size < 1 ||
    input.file.size > FILE_MAX_BYTES
  ) {
    throw publicErrors.validation("File size does not match", {
      field: "fileSize",
    })
  }

  const adapter = getFileOwnerAdapter(input.ownerType)
  await adapter.assertUploadable(db, {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    ownerId: input.ownerId,
  })
  const filename = normalizeFilename(input.file.name)
  const declaredContentType = normalizeDeclaredContentType(input.file.type)
  const detectedImageFormat = await detectImageFormat(input.file)
  const fileId = crypto.randomUUID()
  const reservation = await reservePendingFile(db, {
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
    const runtime = getRuntime()
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
    const ready = await findReadyFileById(db, {
      actorRole: input.actorRole,
      actorUserId: input.actorUserId,
      fileId: reservation.file.id,
      organizationId: input.organizationId,
    })
    if (!ready)
      throw publicErrors.notFound("File not found", { resource: "file" })
    return { created: false, dto: ready.dto }
  }

  const runtime = getRuntime()
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

  await reconcilePendingUpload(db, {
    actorUserId: input.actorUserId,
    file: reservation.file,
    runtime,
  })
  const ready = await findReadyFileById(db, {
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    fileId: reservation.file.id,
    organizationId: input.organizationId,
  })
  if (!ready)
    throw publicErrors.notFound("File not found", { resource: "file" })
  return { created: reservation.created, dto: ready.dto }
}

export const listFiles = async (
  db: Db,
  input: {
    actorRole: OrganizationRole
    actorUserId: string
    cursor?: string
    limit: number
    organizationId: string
    ownerId: string
    ownerType: FileOwnerType
  }
): Promise<FileListDto> => {
  const adapter = getFileOwnerAdapter(input.ownerType)
  await adapter.assertReadable(db, input)
  return listReadyFilesByOwner(db, input)
}

const requireReadyFile = async (
  db: Db,
  input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
  }
) => {
  const file = await findReadyFileById(db, input)
  if (!file) throw publicErrors.notFound("File not found", { resource: "file" })
  await getFileOwnerAdapter(file.stored.ownerType).assertReadable(db, {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    ownerId: file.stored.ownerId,
  })
  return file
}

const httpEtag = (etag: string) =>
  etag.startsWith('"') && etag.endsWith('"') ? etag : `"${etag}"`

const matchesIfNoneMatch = (value: string | null, etag: string) =>
  value
    ?.split(",")
    .map((candidate) => candidate.trim().replace(/^W\//u, ""))
    .some((candidate) => candidate === "*" || candidate === etag) ?? false

const downloadDisposition = (filename: string) => {
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase()}`
  )
  return `attachment; filename="download"; filename*=UTF-8''${encoded}`
}

type ByteRange = { offset: number; length: number }

const parseRange = (
  value: string | null,
  size: number
): ByteRange | null | false => {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return false
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix < 1) return false
    const length = Math.min(suffix, size)
    return { offset: size - length, length }
  }
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return false
  }
  return { offset: start, length: Math.min(end, size - 1) - start + 1 }
}

const privateFileHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-cache",
    "Cross-Origin-Resource-Policy": "same-site",
    "X-Content-Type-Options": "nosniff",
  })

const unsupportedTextPreview = () =>
  new AppError({
    code: "unsupported_media_type",
    publicMessage: "File cannot be previewed as text",
    statusCode: 415,
    publicContext: { resource: "file_preview" },
  })

const readBoundedBody = async (
  body: ReadableStream<Uint8Array>,
  expectedLength: number
) => {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (byteLength < expectedLength) {
      // oxlint-disable-next-line no-await-in-loop -- R2 bodyを上限内で逐次読む。
      const result = await reader.read()
      if (result.done) break
      if (byteLength + result.value.byteLength > expectedLength) {
        throw providerUnavailable("r2", "validateTextPreviewRange")
      }
      chunks.push(result.value)
      byteLength += result.value.byteLength
    }
    if (byteLength !== expectedLength) {
      throw providerUnavailable("r2", "validateTextPreviewRange")
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

const isUtf8ContinuationByte = (byte: number) => (byte & 0xc0) === 0x80

const textPreviewByteLength = (bytes: Uint8Array) => {
  if (bytes.byteLength <= FILE_TEXT_PREVIEW_MAX_BYTES) {
    return bytes.byteLength
  }
  let byteLength = FILE_TEXT_PREVIEW_MAX_BYTES
  while (
    byteLength < bytes.byteLength &&
    isUtf8ContinuationByte(bytes[byteLength] ?? 0)
  ) {
    byteLength += 1
  }
  return byteLength
}

export const previewTextFile = async (
  db: Db,
  input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
  }
): Promise<TextFilePreviewDto> => {
  const file = await requireReadyFile(db, input)
  if (!isTextPreviewableFile(file.stored)) throw unsupportedTextPreview()
  if (!file.stored.etag) {
    throw providerUnavailable("r2", "readTextPreviewMetadata")
  }

  const requestedLength = Math.min(
    file.stored.sizeBytes,
    FILE_TEXT_PREVIEW_MAX_BYTES + 3
  )
  const runtime = getRuntime()
  let bytes: Uint8Array
  try {
    const source = bodyObject(
      await runtime.bucket.get(file.stored.objectKey, {
        onlyIf: new Headers({ "if-match": httpEtag(file.stored.etag) }),
        range: { offset: 0, length: requestedLength },
      })
    )
    if (!source) throw providerUnavailable("r2", "readTextPreviewObject")
    bytes = await readBoundedBody(source.body, requestedLength)
  } catch (error) {
    if (error instanceof AppError) throw error
    throw providerUnavailable("r2", "readTextPreviewObject")
  }

  const previewByteLength = textPreviewByteLength(bytes)
  let content: string
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(0, previewByteLength)
    )
  } catch {
    throw unsupportedTextPreview()
  }
  if (content.includes("\0")) throw unsupportedTextPreview()
  return {
    content,
    truncated: file.stored.sizeBytes > previewByteLength,
  }
}

export const downloadFile = async (
  db: Db,
  input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
    request: Request
  }
): Promise<Response> => {
  const file = await requireReadyFile(db, input)
  if (!file.stored.etag) {
    throw providerUnavailable("r2", "readDownloadMetadata")
  }
  const etag = httpEtag(file.stored.etag)
  const headers = privateFileHeaders()
  headers.set("Accept-Ranges", "bytes")
  headers.set("Content-Disposition", downloadDisposition(file.stored.filename))
  headers.set("Content-Type", "application/octet-stream")
  headers.set("ETag", etag)
  if (matchesIfNoneMatch(input.request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers })
  }

  const range = parseRange(
    input.request.headers.get("range"),
    file.stored.sizeBytes
  )
  if (range === false) {
    headers.set("Content-Range", `bytes */${file.stored.sizeBytes}`)
    return new Response(null, { status: 416, headers })
  }
  const runtime = getRuntime()
  let source: FileR2ObjectBody | null
  try {
    const onlyIf = new Headers({ "if-match": etag })
    source = bodyObject(
      await runtime.bucket.get(
        file.stored.objectKey,
        range ? { onlyIf, range } : { onlyIf }
      )
    )
  } catch {
    throw providerUnavailable("r2", "downloadObject")
  }
  if (!source) throw providerUnavailable("r2", "downloadObject")
  headers.set("Content-Length", String(range?.length ?? file.stored.sizeBytes))
  if (range) {
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${file.stored.sizeBytes}`
    )
  }
  return new Response(source.body, { status: range ? 206 : 200, headers })
}

const previewVariantEtag = async (
  sourceEtag: string,
  width: FilePreviewWidth
) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${sourceEtag}:${width}:webp:q75:anim0:v1`)
  )
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  return `"${hex}"`
}

const cacheKey = (
  request: Request,
  input: {
    fileId: string
    organizationId: string
    sourceEtag: string
    width: FilePreviewWidth
  }
) => {
  const url = new URL(request.url)
  url.pathname = `/__file_preview_cache/organizations/${encodeURIComponent(input.organizationId)}/files/${encodeURIComponent(input.fileId)}/${input.width}`
  url.search = new URLSearchParams({
    source: input.sourceEtag,
    variant: "webp:q75:anim0:v1",
  }).toString()
  return new Request(url, { method: "GET" })
}

const browserPreviewResponse = (response: Response, etag: string) => {
  const headers = privateFileHeaders()
  headers.set("Content-Type", "image/webp")
  headers.set("ETag", etag)
  const contentLength = response.headers.get("content-length")
  if (contentLength) headers.set("Content-Length", contentLength)
  return new Response(response.body, { status: 200, headers })
}

export const previewFile = async (
  db: Db,
  input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
    request: Request
    width: string
  }
): Promise<Response> => {
  const width = FILE_PREVIEW_WIDTHS.find(
    (candidate) => String(candidate) === input.width
  )
  if (width === undefined) {
    throw publicErrors.validation("Unsupported preview width", {
      field: "width",
    })
  }
  const file = await requireReadyFile(db, input)
  if (!isPreviewableImageFormat(file.stored.detectedImageFormat)) {
    throw publicErrors.notFound("File preview not found", {
      resource: "file_preview",
    })
  }
  if (!file.stored.etag) {
    throw providerUnavailable("r2", "readPreviewMetadata")
  }
  const etag = await previewVariantEtag(file.stored.etag, width)
  if (matchesIfNoneMatch(input.request.headers.get("if-none-match"), etag)) {
    const headers = privateFileHeaders()
    headers.set("ETag", etag)
    return new Response(null, { status: 304, headers })
  }

  const runtime = getRuntime()
  const key = cacheKey(input.request, {
    fileId: file.stored.id,
    organizationId: input.organizationId,
    sourceEtag: file.stored.etag,
    width,
  })
  if (runtime.cache) {
    try {
      const cached = await runtime.cache.match(key)
      if (cached) return browserPreviewResponse(cached, etag)
    } catch {
      // Cache API障害時も認証済みrequestはR2 + Imagesへfail-openする。
    }
  }

  let transformed: Response
  try {
    const source = bodyObject(await runtime.bucket.get(file.stored.objectKey))
    if (!source) throw providerUnavailable("r2", "readPreviewObject")
    const result = await runtime.images
      .input(source.body)
      .transform({ width, fit: "scale-down" })
      .output({ format: "image/webp", quality: 75, anim: false })
    transformed = result.response()
    if (!transformed.ok) {
      throw providerUnavailable("images", "transformPreview")
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw providerUnavailable("images", "transformPreview")
  }

  if (runtime.cache) {
    const cacheHeaders = new Headers(transformed.headers)
    cacheHeaders.delete("Set-Cookie")
    cacheHeaders.set("Cache-Control", "public, max-age=2592000")
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

export const removeFile = async (
  db: Db,
  input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
  }
): Promise<void> => {
  const file = await requireReadyFile(db, input)
  if (
    file.stored.uploaderId !== input.actorUserId &&
    input.actorRole === "member"
  ) {
    throw publicErrors.forbidden("Only the uploader or an admin can delete", {
      action: "file.delete",
    })
  }
  const deleted = await deleteReadyFile(db, input)
  if (!deleted)
    throw publicErrors.notFound("File not found", { resource: "file" })
}

export const isRetryableFileError = (error: unknown) =>
  error instanceof AppError && error.statusCode >= 500
