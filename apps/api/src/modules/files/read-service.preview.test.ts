import * as schema from "@enterprise-agentic-saas/db/schema"
import { describe, expect, it } from "vitest"

import { authHeaders, jsonRequest } from "../../app.test-support"
import {
  createFixture,
  createRuntime,
  seedReadyIssueAttachment,
} from "./agent-assets.test-support"
import { FILE_PREVIEW_WIDTHS } from "./constants"
import { configureFileStorageRuntime } from "./runtime"
import { previewFile, removeFile } from "./service.test-support"

const setupPreviewFile = async (suffix: string) => {
  const { app, db } = await createFixture()
  const storage = createRuntime()
  configureFileStorageRuntime(storage.runtime)
  const now = new Date()
  const issueId = `preview-issue-${suffix}`
  const fileId = `preview-file-${suffix}`
  await db.insert(schema.issues).values({
    id: issueId,
    organizationId: "asset-org-a",
    number: 101,
    title: "Private preview contract",
    creatorId: "asset-user-a",
    createdAt: now,
    updatedAt: now,
  })
  await seedReadyIssueAttachment(db, storage, {
    detectedImageFormat: "png",
    fileId,
    issueId,
  })
  return { app, db, fileId, storage }
}

const previewInput = (fileId: string, width = "360") => ({
  actorRole: "owner" as const,
  actorUserId: "asset-user-a",
  fileId,
  organizationId: "asset-org-a",
  request: new Request("https://api.example.test/preview"),
  width,
})

describe("汎用file previewのService Binding境界", () => {
  it("4つのcanonical widthだけを受理してopaque variantを委譲する", async () => {
    const { db, fileId, storage } = await setupPreviewFile("widths")

    for (const width of FILE_PREVIEW_WIDTHS) {
      // oxlint-disable-next-line no-await-in-loop -- 許可variantを個別に検査する
      const response = await previewFile(
        db,
        previewInput(fileId, String(width))
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("image/webp")
      expect(response.headers.get("cache-control")).toBe("private, no-cache")
      expect(response.headers.get("content-length")).toBe("4")
      expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/u)
      expect(response.headers.get("x-content-type-options")).toBe("nosniff")
      expect(response.headers.get("cross-origin-resource-policy")).toBe(
        "same-site"
      )
      expect(response.headers.get("set-cookie")).toBeNull()
      expect(response.headers.get("x-internal-cache")).toBeNull()
    }

    expect(storage.previewFetch).toHaveBeenCalledTimes(
      FILE_PREVIEW_WIDTHS.length
    )
    const internalRequest = storage.previewFetch.mock.calls[0]?.[0]
    if (!internalRequest) throw new Error("Preview request is missing")
    expect(internalRequest.url).toBe(
      `https://images.internal/v1/previews/file/asset-org-a/${fileId}/360?source=agent-etag-1&variant=webp%3Aq75%3Aanim0%3Av1`
    )
    expect(internalRequest.url).not.toContain("private/")
    expect(internalRequest.headers.get("x-preview-cache-ttl")).toBe("2592000")
    expect(internalRequest.headers.get("x-preview-object-key")).toBe(
      `organizations/asset-org-a/files/issue/preview-issue-widths/${fileId}`
    )
  })

  it("canonicalでないpreview widthをprivate Worker呼出前に拒否する", async () => {
    const { db, fileId, storage } = await setupPreviewFile("invalid-width")

    await expect(
      previewFile(db, previewInput(fileId, "0360"))
    ).rejects.toMatchObject({ code: "validation_error" })
    expect(storage.previewFetch).not.toHaveBeenCalled()
  })

  it.each([
    { kind: "missing", label: "存在しないfile" },
    { kind: "deleted", label: "削除済みfile" },
  ] as const)("$labelをprivate Worker呼出前に拒否する", async ({ kind }) => {
    const { db, fileId, storage } = await setupPreviewFile(kind)
    if (kind === "deleted") {
      await removeFile(db, {
        actorRole: "owner",
        actorUserId: "asset-user-a",
        fileId,
        organizationId: "asset-org-a",
      })
    }

    await expect(
      previewFile(
        db,
        previewInput(kind === "missing" ? "missing-file" : fileId)
      )
    ).rejects.toMatchObject({ code: "not_found" })
    expect(storage.previewFetch).not.toHaveBeenCalled()
  })

  it("実organization削除後に同じpreview URLを到達不能にする", async () => {
    const { app, fileId, storage } = await setupPreviewFile("org-delete")
    const previewUrl = `http://localhost/files/organizations/asset-org-a/${fileId}/preview/360`
    const previewRequest = () =>
      new Request(previewUrl, {
        headers: authHeaders("asset-user-a", {
          activeOrganizationId: "asset-org-a",
          json: false,
          sessionId: "asset-session-a",
        }),
      })
    expect((await app.handle(previewRequest())).status).toBe(200)
    storage.previewFetch.mockClear()

    const deleted = await app.handle(
      jsonRequest("/organizations/asset-org-a", {
        method: "DELETE",
        userId: "asset-user-a",
        activeOrganizationId: "asset-org-a",
        sessionId: "asset-session-a",
        body: {
          slug: "asset-org-a",
          confirmation: "DELETE",
          idempotencyKey: "delete-preview-org-01",
        },
      })
    )
    expect(deleted.status).toBe(200)

    const unreachable = await app.handle(previewRequest())
    expect(unreachable.status).toBe(404)
    expect(storage.previewFetch).not.toHaveBeenCalled()
  })
})
