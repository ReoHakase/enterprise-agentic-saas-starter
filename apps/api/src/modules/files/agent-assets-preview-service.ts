import { AppError, publicErrors } from "../../errors/app-error"
import type { AgentAssetWithStorage } from "./agent-assets-domain"
import {
  agentAssetBodyObject as bodyObject,
  agentAssetProviderUnavailable as providerUnavailable,
} from "./agent-assets-runtime"
import { FILE_PREVIEW_WIDTHS, type FilePreviewWidth } from "./constants"
import { createModelImageResponse } from "./model-image-service"
import type { AgentAssetPreviewPorts } from "./ports"
import type { FileStorageRuntime } from "./runtime"

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

export const createAgentAssetPreviewService = (
  ports: AgentAssetPreviewPorts
) => {
  const previewAgentAsset = async (input: {
    actorUserId: string
    assetId: string
    organizationId: string
    request: Request
    sessionId: string
    width: string
  }) => {
    const width = FILE_PREVIEW_WIDTHS.find(
      (candidate) => String(candidate) === input.width
    )
    if (width === undefined) {
      throw publicErrors.validation("Unsupported preview width", {
        field: "width",
      })
    }
    const value = await ports.findPreviewableAgentAssetForSession({
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

    const runtime = ports.getRuntime()
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
      const cacheTtlSeconds =
        value.asset.status === "promoted"
          ? 3 * 24 * 60 * 60
          : Math.max(
              1,
              Math.min(
                3 * 24 * 60 * 60,
                Math.floor(
                  (value.asset.expiresAt.getTime() - Date.now()) / 1000
                )
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

  const getAgentImageForModel = async (input: {
    grant: string
    assetId: string
  }): Promise<Response> => {
    const access = await ports.findAgentRunAssetForModel(input)
    if (!access.storage.objectKey || !access.storage.etag) {
      throw providerUnavailable("r2", "readAgentAssetImage")
    }
    return createModelImageResponse(ports.getRuntime(), {
      etag: access.storage.etag,
      objectKey: access.storage.objectKey,
      resource: "agent_asset",
    })
  }

  const removeAgentAsset = async (input: {
    actorUserId: string
    assetId: string
    organizationId: string
    sessionId: string
  }) => {
    const deleted = await ports.deleteReadyAgentAsset({
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

  return { getAgentImageForModel, previewAgentAsset, removeAgentAsset }
}

export type AgentAssetPreviewService = ReturnType<
  typeof createAgentAssetPreviewService
>
