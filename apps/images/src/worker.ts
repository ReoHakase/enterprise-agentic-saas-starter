const previewWidths = new Set([360, 720, 1200, 2400])
const transformVersion = "webp:q75:anim0:v1"
const objectKeyHeader = "X-Preview-Object-Key"
const cacheTtlHeader = "X-Preview-Cache-Ttl"
const fileCacheTtlSeconds = 30 * 24 * 60 * 60
const agentAssetCacheTtlSeconds = 3 * 24 * 60 * 60

type PreviewResourceKind = "agent-asset" | "file"

type PreviewR2ObjectBody = {
  body: ReadableStream<Uint8Array>
}

export type PreviewR2Bucket = {
  get(
    key: string,
    options: { onlyIf: { etagMatches: string } }
  ): Promise<PreviewR2ObjectBody | object | null>
}

export type PreviewImagesBinding = {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { fit: "scale-down"; width: number }): {
      output(options: {
        anim: false
        format: "image/webp"
        quality: 75
      }): Promise<{ response(): Response }>
    }
  }
}

export type PreviewWorkerEnvironment = {
  FILES: PreviewR2Bucket
  IMAGES: PreviewImagesBinding
}

type PreviewInput = {
  cacheTtlSeconds: number
  objectKey: string
  organizationId: string
  resourceId: string
  resourceKind: PreviewResourceKind
  sourceEtag: string
  width: number
}

const failureResponse = (status: number) =>
  new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })

const decodeOpaqueId = (value: string | undefined): string | null => {
  if (!value) return null
  try {
    const decoded = decodeURIComponent(value)
    return /^[A-Za-z0-9_-]{1,128}$/u.test(decoded) ? decoded : null
  } catch {
    return null
  }
}

const isBoundedAscii = (value: string, maximumLength: number) =>
  value.length > 0 &&
  value.length <= maximumLength &&
  [...value].every((character) => {
    const codePoint = character.charCodeAt(0)
    return codePoint >= 0x21 && codePoint <= 0x7e
  })

const cacheTtlFor = (
  resourceKind: PreviewResourceKind,
  value: string | null
): number | null => {
  if (!value || !/^\d+$/u.test(value)) return null
  const seconds = Number(value)
  if (!Number.isSafeInteger(seconds) || String(seconds) !== value) return null
  if (resourceKind === "file") {
    return seconds === fileCacheTtlSeconds ? seconds : null
  }
  return seconds >= 1 && seconds <= agentAssetCacheTtlSeconds ? seconds : null
}

const objectKeyMatchesResource = (input: {
  objectKey: string
  organizationId: string
  resourceId: string
  resourceKind: PreviewResourceKind
}) => {
  if (!isBoundedAscii(input.objectKey, 1024)) return false
  const organizationPrefix = `organizations/${encodeURIComponent(input.organizationId)}/`
  if (!input.objectKey.startsWith(organizationPrefix)) return false
  if (input.resourceKind === "agent-asset") {
    return input.objectKey.startsWith(`${organizationPrefix}storage-objects/`)
  }
  const encodedResourceId = encodeURIComponent(input.resourceId)
  const fileKeyMatches =
    input.objectKey.startsWith(`${organizationPrefix}files/`) &&
    input.objectKey.endsWith(`/${encodedResourceId}`)
  const storageObjectKeyMatches =
    input.objectKey ===
    `${organizationPrefix}storage-objects/${encodedResourceId}`
  return fileKeyMatches || storageObjectKeyMatches
}

const parsePreviewInput = (request: Request): PreviewInput | null => {
  if (request.method !== "GET") return null
  const url = new URL(request.url)
  const [
    ,
    version,
    previews,
    resourceKind,
    encodedOrganizationId,
    encodedResourceId,
    rawWidth,
    ...rest
  ] = url.pathname.split("/")
  if (
    version !== "v1" ||
    previews !== "previews" ||
    (resourceKind !== "file" && resourceKind !== "agent-asset") ||
    rest.length > 0
  ) {
    return null
  }
  const organizationId = decodeOpaqueId(encodedOrganizationId)
  const resourceId = decodeOpaqueId(encodedResourceId)
  const width = Number(rawWidth)
  const sourceEtag = url.searchParams.get("source")
  const cacheTtlSeconds = cacheTtlFor(
    resourceKind,
    request.headers.get(cacheTtlHeader)
  )
  const objectKey = request.headers.get(objectKeyHeader)
  if (
    !organizationId ||
    !resourceId ||
    !rawWidth ||
    !previewWidths.has(width) ||
    String(width) !== rawWidth ||
    !sourceEtag ||
    !isBoundedAscii(sourceEtag, 128) ||
    url.searchParams.get("variant") !== transformVersion ||
    url.searchParams.size !== 2 ||
    cacheTtlSeconds === null ||
    !objectKey ||
    !objectKeyMatchesResource({
      objectKey,
      organizationId,
      resourceId,
      resourceKind,
    })
  ) {
    return null
  }
  return {
    cacheTtlSeconds,
    objectKey,
    organizationId,
    resourceId,
    resourceKind,
    sourceEtag,
    width,
  }
}

const bodyObject = (
  object: PreviewR2ObjectBody | object | null
): PreviewR2ObjectBody | null =>
  object && "body" in object && object.body instanceof ReadableStream
    ? { body: object.body }
    : null

const variantEtag = async (input: PreviewInput) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${input.sourceEtag}:${input.width}:${transformVersion}`
    )
  )
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  return `"${hex}"`
}

export const handleImagePreviewRequest = async (
  request: Request,
  environment: PreviewWorkerEnvironment
): Promise<Response> => {
  const input = parsePreviewInput(request)
  if (!input) return failureResponse(400)

  try {
    const source = bodyObject(
      await environment.FILES.get(input.objectKey, {
        onlyIf: { etagMatches: input.sourceEtag },
      })
    )
    if (!source) return failureResponse(404)

    const result = await environment.IMAGES.input(source.body)
      .transform({ width: input.width, fit: "scale-down" })
      .output({ format: "image/webp", quality: 75, anim: false })
    const transformed = result.response()
    if (
      !transformed.ok ||
      !transformed.body ||
      transformed.headers.get("content-type") !== "image/webp"
    ) {
      await transformed.body?.cancel().catch(() => undefined)
      return failureResponse(502)
    }

    const headers = new Headers({
      "Cache-Control": `public, max-age=${input.cacheTtlSeconds}, must-revalidate`,
      "Content-Type": "image/webp",
      ETag: await variantEtag(input),
      "X-Content-Type-Options": "nosniff",
    })
    const contentLength = transformed.headers.get("content-length")
    if (contentLength && /^\d+$/u.test(contentLength)) {
      headers.set("Content-Length", contentLength)
    }
    return new Response(transformed.body, { status: 200, headers })
  } catch {
    return failureResponse(502)
  }
}

export default {
  fetch: handleImagePreviewRequest,
} satisfies ExportedHandler<CloudflareEnv>
