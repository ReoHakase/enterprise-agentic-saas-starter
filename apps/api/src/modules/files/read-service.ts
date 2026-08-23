import { HttpError } from "../../errors/http-error"
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
  downloadDisposition,
  httpEtag,
  matchesIfNoneMatch,
  parseRange,
  privateFileHeaders,
  readBoundedBody,
  requestImagePreview,
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
    if (!file) throw new HttpError({ code: "not_found" })
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
      if (error instanceof HttpError) throw error
      throw providerUnavailable("r2", "readTextPreviewObject", error)
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
    } catch (cause) {
      throw providerUnavailable("r2", "downloadObject", cause)
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
      throw new HttpError({ code: "validation_error" })
    }
    const file = await requireReadyFile(input)
    if (!isPreviewableImageFormat(file.stored.detectedImageFormat)) {
      throw new HttpError({ code: "not_found" })
    }
    if (!file.stored.etag) {
      throw providerUnavailable("r2", "readPreviewMetadata")
    }
    const resourceId =
      file.stored.keyVersion === 2
        ? file.stored.storageObjectId
        : file.stored.id
    if (!resourceId) {
      throw providerUnavailable("r2", "readPreviewMetadata")
    }
    const runtime = ports.getRuntime()
    return requestImagePreview(runtime, {
      browserRequest: input.request,
      cacheTtlSeconds: 30 * 24 * 60 * 60,
      objectKey: file.stored.objectKey,
      organizationId: input.organizationId,
      resourceId,
      resourceKind: "file",
      sourceEtag: file.stored.etag,
      width,
    })
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
      throw new HttpError({ code: "forbidden" })
    }
    const deleted = await ports.deleteReadyFile({
      actorUserId: input.actorUserId,
      file: file.stored,
    })
    if (!deleted) throw new HttpError({ code: "not_found" })
  }

  return { downloadFile, listFiles, previewFile, previewTextFile, removeFile }
}

export type FileReadService = ReturnType<typeof createFileReadService>
