import { AppError, publicErrors } from "../../errors/app-error"
import {
  AGENT_ASSET_MODEL_MAX_BYTES,
  AGENT_ASSET_MODEL_MAX_EDGE,
} from "./constants"
import {
  type FileR2Object,
  type FileR2ObjectBody,
  type FileStorageRuntime,
} from "./runtime"

const providerUnavailable = (provider: "images" | "r2", operation: string) =>
  new AppError({
    code: "service_unavailable",
    publicMessage: "Service temporarily unavailable",
    statusCode: 503,
    publicContext: { retryAfter: 30 },
    privateContext: { module: "model-image", operation, provider },
  })

const bodyObject = (
  object: FileR2Object | FileR2ObjectBody | null
): FileR2ObjectBody | null =>
  object && "body" in object && object.body instanceof ReadableStream
    ? object
    : null

const httpEtag = (etag: string) =>
  etag.startsWith('"') && etag.endsWith('"') ? etag : `"${etag}"`

const readBoundedImage = async (
  body: ReadableStream<Uint8Array>,
  maximumBytes: number,
  resource: "agent_asset" | "issue_attachment"
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
          resource,
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

/**
 * 認可済みR2 objectをmodel向けの固定variantへ変換し、unknown-lengthも
 * materializeしてからprivate responseを返す。呼出側が認可とquotaを担う。
 */
export const createModelImageResponse = async (
  runtime: FileStorageRuntime,
  input: {
    etag: string
    objectKey: string
    resource: "agent_asset" | "issue_attachment"
  }
): Promise<Response> => {
  let transformed: Response
  try {
    const source = bodyObject(
      await runtime.bucket.get(input.objectKey, {
        onlyIf: new Headers({ "if-match": httpEtag(input.etag) }),
      })
    )
    if (!source) throw providerUnavailable("r2", "readModelImage")
    const result = await runtime.images
      .input(source.body)
      .transform({ width: AGENT_ASSET_MODEL_MAX_EDGE, fit: "scale-down" })
      .output({ format: "image/webp", quality: 75, anim: false })
    transformed = result.response()
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    throw providerUnavailable("images", "transformModelImage")
  }

  if (!transformed.ok || !transformed.body) {
    throw providerUnavailable("images", "transformModelImage")
  }
  const declaredLength = Number(transformed.headers.get("content-length"))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > AGENT_ASSET_MODEL_MAX_BYTES
  ) {
    await transformed.body.cancel().catch(() => undefined)
    throw publicErrors.validation("Image is too large for model input", {
      resource: input.resource,
      reason: "model_image_too_large",
    })
  }
  const outputContentType = transformed.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
  if (outputContentType !== "image/webp") {
    await transformed.body.cancel().catch(() => undefined)
    throw providerUnavailable("images", "validateModelImageOutputType")
  }

  const bytes = await readBoundedImage(
    transformed.body,
    AGENT_ASSET_MODEL_MAX_BYTES,
    input.resource
  )
  return new Response(new Blob([bytes], { type: "image/webp" }), {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(bytes.byteLength),
      "Content-Type": "image/webp",
      "Cross-Origin-Resource-Policy": "same-site",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
