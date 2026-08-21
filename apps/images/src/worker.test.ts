import { describe, expect, it, vi } from "vitest"

import {
  handleImagePreviewRequest,
  type PreviewImagesBinding,
  type PreviewR2Bucket,
} from "./worker"

const sourceEtag = "source-etag-1"
const objectKey = "organizations/org-1/files/issue/issue-1/file-1"

const previewRequest = (
  overrides: {
    cacheTtl?: null | string
    extraQuery?: boolean
    method?: string
    objectKey?: null | string
    organizationId?: string
    resourceId?: string
    resourceKind?: "agent-asset" | "file"
    sourceEtag?: null | string
    trailingPath?: string
    variant?: null | string
    width?: string
  } = {}
) => {
  const resourceKind = overrides.resourceKind ?? "file"
  const organizationId = overrides.organizationId ?? "org-1"
  const resourceId = overrides.resourceId ?? "file-1"
  const url = new URL(
    `https://images.internal/v1/previews/${resourceKind}/${organizationId}/${resourceId}/${overrides.width ?? "360"}${overrides.trailingPath ?? ""}`
  )
  const search = new URLSearchParams()
  const requestedSourceEtag =
    overrides.sourceEtag === undefined ? sourceEtag : overrides.sourceEtag
  const variant =
    overrides.variant === undefined ? "webp:q75:anim0:v1" : overrides.variant
  if (requestedSourceEtag !== null) search.set("source", requestedSourceEtag)
  if (variant !== null) search.set("variant", variant)
  if (overrides.extraQuery) search.set("extra", "not-a-cache-key")
  url.search = search.toString()
  const headers = new Headers()
  const cacheTtl =
    overrides.cacheTtl === undefined
      ? resourceKind === "file"
        ? "2592000"
        : "259200"
      : overrides.cacheTtl
  const requestedObjectKey =
    overrides.objectKey === undefined ? objectKey : overrides.objectKey
  if (cacheTtl !== null) headers.set("X-Preview-Cache-Ttl", cacheTtl)
  if (requestedObjectKey !== null) {
    headers.set("X-Preview-Object-Key", requestedObjectKey)
  }
  return new Request(url, {
    method: overrides.method ?? "GET",
    headers,
  })
}

const createEnvironment = () => {
  const get = vi.fn<PreviewR2Bucket["get"]>(async () => ({
    body: new Blob([new Uint8Array([1, 2, 3])]).stream(),
  }))
  const response = vi.fn<() => Response>(
    () =>
      new Response(new Uint8Array([4, 5, 6]), {
        headers: {
          "Content-Length": "3",
          "Content-Type": "image/webp",
          "Set-Cookie": "provider=secret",
          "X-Provider-Error": "private",
        },
      })
  )
  type ImagesInput = ReturnType<PreviewImagesBinding["input"]>
  type Transform = ReturnType<ImagesInput["transform"]>
  const output = vi.fn<Transform["output"]>(async () => ({ response }))
  const transform = vi.fn<ImagesInput["transform"]>(() => ({ output }))
  const input = vi.fn<PreviewImagesBinding["input"]>(() => ({ transform }))
  return {
    environment: { FILES: { get }, IMAGES: { input } },
    get,
    input,
    output,
    response,
    transform,
  }
}

describe("private Images Worker", () => {
  it.each([360, 720, 1200, 2400] as const)(
    "conditionally reads R2 and applies the fixed %i px transform",
    async (width) => {
      const fake = createEnvironment()
      const response = await handleImagePreviewRequest(
        previewRequest({ width: String(width) }),
        fake.environment
      )

      expect(response.status).toBe(200)
      expect(fake.get).toHaveBeenCalledWith(objectKey, {
        onlyIf: { etagMatches: sourceEtag },
      })
      expect(fake.transform).toHaveBeenCalledWith({
        fit: "scale-down",
        width,
      })
      expect(fake.output).toHaveBeenCalledWith({
        anim: false,
        format: "image/webp",
        quality: 75,
      })
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=2592000, must-revalidate"
      )
      expect(response.headers.get("content-type")).toBe("image/webp")
      expect(response.headers.get("content-length")).toBe("3")
      expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/u)
      expect(response.headers.get("set-cookie")).toBeNull()
      expect(response.headers.get("x-provider-error")).toBeNull()
    }
  )

  it("preserves the bounded temporary Agent asset TTL", async () => {
    const fake = createEnvironment()
    const response = await handleImagePreviewRequest(
      previewRequest({
        cacheTtl: "321",
        objectKey: "organizations/org-1/storage-objects/storage-1",
        resourceId: "asset-1",
        resourceKind: "agent-asset",
      }),
      fake.environment
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=321, must-revalidate"
    )
  })

  it("accepts a promoted file backed by the same storage object identity", async () => {
    const fake = createEnvironment()
    const promotedObjectKey =
      "organizations/org-1/storage-objects/storage-promoted-1"
    const response = await handleImagePreviewRequest(
      previewRequest({
        objectKey: promotedObjectKey,
        resourceId: "storage-promoted-1",
      }),
      fake.environment
    )

    expect(response.status).toBe(200)
    expect(fake.get).toHaveBeenCalledWith(promotedObjectKey, {
      onlyIf: { etagMatches: sourceEtag },
    })
  })

  it.each([
    { name: "non-GET method", request: previewRequest({ method: "POST" }) },
    { name: "missing path", request: new Request("https://images.internal/") },
    {
      name: "missing organization ID",
      request: previewRequest({ organizationId: "" }),
    },
    {
      name: "missing resource ID",
      request: previewRequest({ resourceId: "" }),
    },
    {
      name: "normalized traversal path",
      request: previewRequest({ organizationId: "../other" }),
    },
    {
      name: "decoded slash in organization ID",
      request: previewRequest({ organizationId: "%2F" }),
    },
    {
      name: "malformed encoded organization ID",
      request: previewRequest({ organizationId: "%" }),
    },
    { name: "missing width", request: previewRequest({ width: "" }) },
    { name: "noncanonical width", request: previewRequest({ width: "0360" }) },
    { name: "unsupported width", request: previewRequest({ width: "361" }) },
    {
      name: "extra path segment",
      request: previewRequest({ trailingPath: "/extra" }),
    },
    {
      name: "missing source ETag",
      request: previewRequest({ sourceEtag: null }),
    },
    { name: "empty source ETag", request: previewRequest({ sourceEtag: "" }) },
    {
      name: "control source ETag",
      request: previewRequest({ sourceEtag: "source\u0001etag" }),
    },
    {
      name: "overlong source ETag",
      request: previewRequest({ sourceEtag: "s".repeat(129) }),
    },
    { name: "missing variant", request: previewRequest({ variant: null }) },
    { name: "unknown variant", request: previewRequest({ variant: "future" }) },
    { name: "extra query", request: previewRequest({ extraQuery: true }) },
    { name: "missing TTL", request: previewRequest({ cacheTtl: null }) },
    { name: "non-digit TTL", request: previewRequest({ cacheTtl: "abc" }) },
    {
      name: "unsafe integer TTL",
      request: previewRequest({ cacheTtl: "9007199254740992" }),
    },
    {
      name: "noncanonical TTL",
      request: previewRequest({ cacheTtl: "02592000" }),
    },
    {
      name: "wrong file TTL",
      request: previewRequest({ cacheTtl: "2591999" }),
    },
    {
      name: "zero Agent TTL",
      request: previewRequest({
        cacheTtl: "0",
        objectKey: "organizations/org-1/storage-objects/storage-1",
        resourceId: "asset-1",
        resourceKind: "agent-asset",
      }),
    },
    {
      name: "Agent TTL above three days",
      request: previewRequest({
        cacheTtl: "259201",
        objectKey: "organizations/org-1/storage-objects/storage-1",
        resourceId: "asset-1",
        resourceKind: "agent-asset",
      }),
    },
    {
      name: "missing object key",
      request: previewRequest({ objectKey: null }),
    },
    { name: "empty object key", request: previewRequest({ objectKey: "" }) },
    {
      name: "control object key",
      request: previewRequest({ objectKey: `organizations/org-1/\u0001` }),
    },
    {
      name: "overlong object key",
      request: previewRequest({ objectKey: "a".repeat(1025) }),
    },
    {
      name: "wrong object organization",
      request: previewRequest({
        objectKey: "organizations/org-2/files/issue/issue-1/file-1",
      }),
    },
    {
      name: "wrong file object suffix",
      request: previewRequest({
        objectKey: "organizations/org-1/files/issue/issue-1/other-file",
      }),
    },
    {
      name: "wrong promoted storage object suffix",
      request: previewRequest({
        objectKey: "organizations/org-1/storage-objects/other-storage",
        resourceId: "storage-promoted-1",
      }),
    },
    {
      name: "wrong Agent object prefix",
      request: previewRequest({
        objectKey: "organizations/org-1/files/issue/issue-1/asset-1",
        resourceId: "asset-1",
        resourceKind: "agent-asset",
      }),
    },
  ])(
    "rejects invalid internal input before R2 access: $name",
    async ({ request }) => {
      const fake = createEnvironment()
      const response = await handleImagePreviewRequest(
        request,
        fake.environment
      )

      expect(response.status).toBe(400)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(response.headers.get("x-content-type-options")).toBe("nosniff")
      expect(await response.text()).toBe("")
      expect(fake.get).not.toHaveBeenCalled()
      expect(fake.input).not.toHaveBeenCalled()
    }
  )

  it.each([null, {}, { body: "not-a-stream" }])(
    "returns a safe non-cacheable response for stale R2 metadata",
    async (stored) => {
      const fake = createEnvironment()
      fake.get.mockResolvedValueOnce(stored)

      const response = await handleImagePreviewRequest(
        previewRequest(),
        fake.environment
      )

      expect(response.status).toBe(404)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.text()).toBe("")
      expect(fake.input).not.toHaveBeenCalled()
    }
  )

  it("cancels and redacts a non-success transformed response", async () => {
    const fake = createEnvironment()
    const transformed = new Response("provider detail", {
      status: 503,
      headers: { "X-Provider-Error": "private" },
    })
    const body = transformed.body
    if (!body) throw new Error("Expected the provider response body")
    const cancel = vi.spyOn(body, "cancel")
    fake.response.mockReturnValueOnce(transformed)

    const response = await handleImagePreviewRequest(
      previewRequest(),
      fake.environment
    )

    expect(response.status).toBe(502)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-provider-error")).toBeNull()
    expect(await response.text()).toBe("")
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("cancels and redacts a transformed response with the wrong content type", async () => {
    const fake = createEnvironment()
    const transformed = new Response("private provider detail", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "X-Provider-Error": "private",
      },
    })
    const body = transformed.body
    if (!body) throw new Error("Expected the provider response body")
    const cancel = vi.spyOn(body, "cancel")
    fake.response.mockReturnValueOnce(transformed)

    const response = await handleImagePreviewRequest(
      previewRequest(),
      fake.environment
    )

    expect(response.status).toBe(502)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("content-type")).toBeNull()
    expect(response.headers.get("x-provider-error")).toBeNull()
    expect(await response.text()).toBe("")
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("redacts a bodyless transformed response", async () => {
    const fake = createEnvironment()
    fake.response.mockReturnValueOnce(
      new Response(null, {
        status: 200,
        headers: { "X-Provider-Error": "private" },
      })
    )

    const response = await handleImagePreviewRequest(
      previewRequest(),
      fake.environment
    )

    expect(response.status).toBe(502)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-provider-error")).toBeNull()
    expect(await response.text()).toBe("")
  })

  it("keeps provider rejection safe when response cancellation fails", async () => {
    const fake = createEnvironment()
    const transformed = new Response("provider detail", { status: 503 })
    const body = transformed.body
    if (!body) throw new Error("Expected the provider response body")
    vi.spyOn(body, "cancel").mockRejectedValueOnce(
      new Error("private cancellation detail")
    )
    fake.response.mockReturnValueOnce(transformed)

    const response = await handleImagePreviewRequest(
      previewRequest(),
      fake.environment
    )

    expect(response.status).toBe(502)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.text()).toBe("")
  })

  it.each([null, "not-a-number"])(
    "omits a missing or invalid provider Content-Length: %s",
    async (contentLength) => {
      const fake = createEnvironment()
      const headers = new Headers({
        "Content-Type": "image/webp",
        "X-Provider-Error": "private",
      })
      if (contentLength !== null) headers.set("Content-Length", contentLength)
      fake.response.mockReturnValueOnce(
        new Response(new Uint8Array([4, 5, 6]), { headers })
      )

      const response = await handleImagePreviewRequest(
        previewRequest(),
        fake.environment
      )

      expect(response.status).toBe(200)
      expect(response.headers.get("content-length")).toBeNull()
      expect(response.headers.get("x-provider-error")).toBeNull()
    }
  )

  it("redacts Images failures without logging request material", async () => {
    const fake = createEnvironment()
    fake.output.mockRejectedValueOnce(new Error("provider payload"))
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await handleImagePreviewRequest(
      previewRequest(),
      fake.environment
    )

    expect(response.status).toBe(502)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.text()).toBe("")
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it("redacts R2 failures without logging request material", async () => {
    const fake = createEnvironment()
    fake.get.mockRejectedValueOnce(new Error("private object key"))
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await handleImagePreviewRequest(
      previewRequest(),
      fake.environment
    )

    expect(response.status).toBe(502)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.text()).toBe("")
    expect(fake.input).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it("changes the variant ETag when the source ETag changes", async () => {
    const fake = createEnvironment()
    const first = await handleImagePreviewRequest(
      previewRequest({ sourceEtag: "source-a" }),
      fake.environment
    )
    const second = await handleImagePreviewRequest(
      previewRequest({ sourceEtag: "source-b" }),
      fake.environment
    )

    expect(first.headers.get("etag")).not.toBe(second.headers.get("etag"))
  })

  it("models URL-keyed Service Binding reuse without emulating platform caching", async () => {
    const fake = createEnvironment()
    const handler = vi.fn<typeof handleImagePreviewRequest>(
      handleImagePreviewRequest
    )
    const responses = new Map<string, Response>()
    const fetch = vi.fn<(request: Request) => Promise<Response>>(
      async (request) => {
        const cached = responses.get(request.url)
        if (cached) return cached.clone()
        const response = await handler(request, fake.environment)
        if (response.ok) responses.set(request.url, response.clone())
        return response
      }
    )

    const first = await fetch(previewRequest())
    const reused = await fetch(previewRequest())
    const changedSource = await fetch(
      previewRequest({ sourceEtag: "source-etag-2" })
    )
    await fetch(
      previewRequest({
        objectKey: "organizations/org-2/files/issue/issue-1/file-1",
        organizationId: "org-2",
      })
    )
    await fetch(
      previewRequest({
        objectKey: "organizations/org-1/files/issue/issue-1/file-2",
        resourceId: "file-2",
      })
    )
    await fetch(previewRequest({ width: "720" }))

    expect(first.status).toBe(200)
    expect(reused.headers.get("etag")).toBe(first.headers.get("etag"))
    expect(changedSource.headers.get("etag")).not.toBe(
      first.headers.get("etag")
    )
    expect([...responses.keys()]).toEqual([
      "https://images.internal/v1/previews/file/org-1/file-1/360?source=source-etag-1&variant=webp%3Aq75%3Aanim0%3Av1",
      "https://images.internal/v1/previews/file/org-1/file-1/360?source=source-etag-2&variant=webp%3Aq75%3Aanim0%3Av1",
      "https://images.internal/v1/previews/file/org-2/file-1/360?source=source-etag-1&variant=webp%3Aq75%3Aanim0%3Av1",
      "https://images.internal/v1/previews/file/org-1/file-2/360?source=source-etag-1&variant=webp%3Aq75%3Aanim0%3Av1",
      "https://images.internal/v1/previews/file/org-1/file-1/720?source=source-etag-1&variant=webp%3Aq75%3Aanim0%3Av1",
    ])
    expect(handler).toHaveBeenCalledTimes(5)
    expect(fake.get).toHaveBeenCalledTimes(5)
    expect(fake.input).toHaveBeenCalledTimes(5)
    expect(fake.get).toHaveBeenNthCalledWith(2, objectKey, {
      onlyIf: { etagMatches: "source-etag-2" },
    })
  })
})
