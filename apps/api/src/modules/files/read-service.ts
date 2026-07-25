import { AppError, publicErrors } from "../../errors/app-error"
import type { OrganizationRole } from "../authorization/public"
import {
  FILE_PREVIEW_WIDTHS,
  FILE_TEXT_PREVIEW_MAX_BYTES,
  isPreviewableImageFormat,
  isTextPreviewableFile,
  type FileOwnerType,
} from "./constants"
import type { FileListDto, TextFilePreviewDto } from "./model"
import type { FileReadPorts } from "./ports"
import {
  browserPreviewResponse,
  cacheKey,
  downloadDisposition,
  httpEtag,
  matchesIfNoneMatch,
  parseRange,
  previewVariantEtag,
  privateFileHeaders,
  readBoundedBody,
  textPreviewByteLength,
  unsupportedTextPreview,
} from "./read-support"
import type { FileR2ObjectBody } from "./runtime"
import { bodyObject, providerUnavailable } from "./service-runtime"

export const createFileReadService = (ports: FileReadPorts) => {
  const listFiles = async (input: {
    actorRole: OrganizationRole
    actorUserId: string
    cursor?: string
    limit: number
    organizationId: string
    ownerId: string
    ownerType: FileOwnerType
  }): Promise<FileListDto> => {
    await ports.assertOwnerReadable(input)
    return ports.listReadyFilesByOwner(input)
  }

  const requireReadyFile = async (input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
  }) => {
    const file = await ports.findReadyFileById(input)
    if (!file)
      throw publicErrors.notFound("File not found", { resource: "file" })
    await ports.assertOwnerReadable({
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      ownerId: file.stored.ownerId,
      ownerType: file.stored.ownerType,
    })
    return file
  }

  const previewTextFile = async (input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
  }): Promise<TextFilePreviewDto> => {
    const file = await requireReadyFile(input)
    if (!isTextPreviewableFile(file.stored)) throw unsupportedTextPreview()
    if (!file.stored.etag) {
      throw providerUnavailable("r2", "readTextPreviewMetadata")
    }

    const requestedLength = Math.min(
      file.stored.sizeBytes,
      FILE_TEXT_PREVIEW_MAX_BYTES + 3
    )
    const runtime = ports.getRuntime()
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

  const downloadFile = async (input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
    request: Request
  }): Promise<Response> => {
    const file = await requireReadyFile(input)
    if (!file.stored.etag) {
      throw providerUnavailable("r2", "readDownloadMetadata")
    }
    const etag = httpEtag(file.stored.etag)
    const headers = privateFileHeaders()
    headers.set("Accept-Ranges", "bytes")
    headers.set(
      "Content-Disposition",
      downloadDisposition(file.stored.filename)
    )
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
    const runtime = ports.getRuntime()
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
    headers.set(
      "Content-Length",
      String(range?.length ?? file.stored.sizeBytes)
    )
    if (range) {
      headers.set(
        "Content-Range",
        `bytes ${range.offset}-${range.offset + range.length - 1}/${file.stored.sizeBytes}`
      )
    }
    return new Response(source.body, { status: range ? 206 : 200, headers })
  }

  const previewFile = async (input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
    request: Request
    width: string
  }): Promise<Response> => {
    const width = FILE_PREVIEW_WIDTHS.find(
      (candidate) => String(candidate) === input.width
    )
    if (width === undefined) {
      throw publicErrors.validation("Unsupported preview width", {
        field: "width",
      })
    }
    const file = await requireReadyFile(input)
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

    const runtime = ports.getRuntime()
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

  const removeFile = async (input: {
    actorRole: OrganizationRole
    actorUserId: string
    fileId: string
    organizationId: string
  }): Promise<void> => {
    const file = await requireReadyFile(input)
    if (
      file.stored.uploaderId !== input.actorUserId &&
      input.actorRole === "member"
    ) {
      throw publicErrors.forbidden("Only the uploader or an admin can delete", {
        action: "file.delete",
      })
    }
    const deleted = await ports.deleteReadyFile({
      actorUserId: input.actorUserId,
      file: file.stored,
    })
    if (!deleted)
      throw publicErrors.notFound("File not found", { resource: "file" })
  }

  return { downloadFile, listFiles, previewFile, previewTextFile, removeFile }
}

export type FileReadService = ReturnType<typeof createFileReadService>
