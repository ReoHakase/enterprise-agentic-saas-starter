import { HttpError } from "../../errors/http-error"
import { FILE_TEXT_PREVIEW_MAX_BYTES, type FilePreviewWidth } from "./constants"
import { providerUnavailable } from "./service-runtime"

export const httpEtag = (etag: string) =>
  etag.startsWith('"') && etag.endsWith('"') ? etag : `"${etag}"`

export const matchesIfNoneMatch = (value: string | null, etag: string) =>
  value
    ?.split(",")
    .map((candidate) => candidate.trim().replace(/^W\//u, ""))
    .some((candidate) => candidate === "*" || candidate === etag) ?? false

export const downloadDisposition = (filename: string) => {
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase()}`
  )
  return `attachment; filename="download"; filename*=UTF-8''${encoded}`
}

type ByteRange = { length: number; offset: number }

export const parseRange = (
  value: string | null,
  size: number
): ByteRange | false | null => {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return false
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix < 1) return false
    const length = Math.min(suffix, size)
    return { length, offset: size - length }
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
  return { length: Math.min(end, size - 1) - start + 1, offset: start }
}

export const privateFileHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-cache",
    "Cross-Origin-Resource-Policy": "same-site",
    "X-Content-Type-Options": "nosniff",
  })

export const unsupportedTextPreview = () =>
  new HttpError({
    code: "unsupported_media_type",
  })

export const readBoundedBody = async (
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

export const textPreviewByteLength = (bytes: Uint8Array) => {
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

export const previewVariantEtag = async (
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

export const cacheKey = (
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

export const browserPreviewResponse = (response: Response, etag: string) => {
  const headers = privateFileHeaders()
  headers.set("Content-Type", "image/webp")
  headers.set("ETag", etag)
  const contentLength = response.headers.get("content-length")
  if (contentLength) headers.set("Content-Length", contentLength)
  return new Response(response.body, { status: 200, headers })
}
