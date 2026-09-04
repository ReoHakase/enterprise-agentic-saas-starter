import { describe, expect, it, vi } from "vitest"

import { requestImagePreview } from "./read-support"
import type { FilePreviewBinding, FileStorageRuntime } from "./runtime"

const previewInput = {
  browserRequest: new Request("https://api.example.test/preview"),
  cacheTtlSeconds: 30 * 24 * 60 * 60,
  objectKey: "organizations/org-1/files/issue/issue-1/file-1",
  organizationId: "org-1",
  resourceId: "file-1",
  resourceKind: "file" as const,
  sourceEtag: "source-etag",
  width: 360 as const,
}

const runtimeWith = (
  fetch: FilePreviewBinding["fetch"]
): Pick<FileStorageRuntime, "previews"> => ({ previews: { fetch } })

describe("画像previewのService Binding adapter", () => {
  it("binding失敗を安全なprovider errorへ写像する", async () => {
    const fetch = vi.fn<FilePreviewBinding["fetch"]>(async () => {
      throw new Error("private provider detail")
    })

    await expect(
      requestImagePreview(runtimeWith(fetch), previewInput)
    ).rejects.toMatchObject({ code: "service_unavailable" })
  })

  it("bodyを公開せず不正な内部responseを拒否する", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("private provider detail"))
        controller.close()
      },
    })
    const cancel = vi.spyOn(body, "cancel")
    const fetch = vi.fn<FilePreviewBinding["fetch"]>(
      async () =>
        new Response(body, {
          status: 502,
          headers: {
            "Content-Type": "text/plain",
            ETag: "provider-etag",
          },
        })
    )

    await expect(
      requestImagePreview(runtimeWith(fetch), previewInput)
    ).rejects.toMatchObject({ code: "service_unavailable" })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("bodyのない200 responseを拒否する", async () => {
    const fetch = vi.fn<FilePreviewBinding["fetch"]>(
      async () =>
        new Response(null, {
          status: 200,
          headers: {
            "Content-Type": "image/webp",
            ETag: `"${"a".repeat(64)}"`,
          },
        })
    )
    await expect(
      requestImagePreview(runtimeWith(fetch), previewInput)
    ).rejects.toMatchObject({ code: "service_unavailable" })
  })

  it.each([
    {
      name: "content typeが異なる場合",
      response: () =>
        new Response("provider detail", {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            ETag: `"${"a".repeat(64)}"`,
          },
        }),
    },
    {
      name: "ETagがない場合",
      response: () =>
        new Response("provider detail", {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        }),
    },
    {
      name: "ETagが不正な場合",
      response: () =>
        new Response("provider detail", {
          status: 200,
          headers: {
            "Content-Type": "image/webp",
            ETag: "provider-etag",
          },
        }),
    },
  ])("$nameを持つ200 responseを拒否する", async ({ response }) => {
    const internalResponse = response()
    const body = internalResponse.body
    if (!body) throw new Error("Expected the provider response body")
    const cancel = vi.spyOn(body, "cancel")
    const fetch = vi.fn<FilePreviewBinding["fetch"]>(
      async () => internalResponse
    )

    await expect(
      requestImagePreview(runtimeWith(fetch), previewInput)
    ).rejects.toMatchObject({ code: "service_unavailable" })
    expect(cancel).toHaveBeenCalledOnce()
  })
})
