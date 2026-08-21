import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq, sql } from "drizzle-orm"
import * as v from "valibot"
import { describe, expect, it, vi } from "vitest"

import {
  finalizePendingAgentAsset,
  reservePendingAgentAsset,
  type AgentAssetWithStorage,
} from "./agent-assets-repository"
import {
  assetRequest,
  createFixture,
  createRuntime,
  pngFile,
  reconcilePendingAgentAssetForTest,
  seedReadyAssetBatch,
  uploadDirect,
  uploadRequest,
} from "./agent-assets.test-support"
import {
  AGENT_ASSET_MAX_BYTES,
  AGENT_ASSET_MAX_READY_PER_ORGANIZATION,
  ORGANIZATION_FILE_QUOTA_BYTES,
  agentAssetObjectKey,
} from "./constants"
import { agentAssetDtoModel } from "./model"
import { configureFileStorageRuntime } from "./runtime"

describe("Agent staged image API and lifecycle", () => {
  it("uploads one private Standard object and returns only an opaque DTO", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()

    const response = await app.handle(
      uploadRequest({ file, uploadId: "agent-upload-success" })
    )
    expect(response.status).toBe(201)
    const dto = v.parse(agentAssetDtoModel, await response.json())
    expect(Object.keys(dto).toSorted()).toEqual(
      [
        "expiresAt",
        "filename",
        "id",
        "imageHeight",
        "imageWidth",
        "previewable",
        "sizeBytes",
      ].toSorted()
    )
    expect(dto).toMatchObject({
      filename: "agent-image.png",
      imageHeight: 360,
      imageWidth: 640,
      previewable: true,
      sizeBytes: file.size,
    })
    expect(dto.id).toMatch(/^[0-9a-f-]{36}$/u)
    expect(JSON.stringify(dto)).not.toContain("organizations/")
    expect(JSON.stringify(dto)).not.toContain("objectKey")

    expect(storage.put).toHaveBeenCalledTimes(1)
    const [key, , options] = storage.put.mock.calls[0] ?? []
    expect(key).toMatch(
      /^organizations\/asset-org-a\/storage-objects\/[0-9a-f-]{36}$/u
    )
    expect(options).toMatchObject({
      httpMetadata: { contentType: "application/octet-stream" },
      storageClass: "Standard",
    })
    expect(options?.onlyIf?.get("if-none-match")).toBe("*")
    expect(Object.keys(options?.customMetadata ?? {}).toSorted()).toEqual([
      "agentAssetId",
      "expectedSize",
      "storageObjectId",
      "uploadId",
    ])
    expect(options?.customMetadata).toMatchObject({
      expectedSize: String(file.size),
      uploadId: "agent-upload-success",
    })

    const [asset] = await db.select().from(schema.agentAssets)
    const [object] = await db.select().from(schema.storageObjects)
    const [claim] = await db.select().from(schema.storageObjectClaims)
    const [usage] = await db.select().from(schema.organizationFileUsage)
    expect(asset).toMatchObject({
      id: dto.id,
      organizationId: "asset-org-a",
      sessionId: "asset-session-a",
      status: "ready",
      threadId: "asset-thread-a",
      uploaderId: "asset-user-a",
    })
    expect(object).toMatchObject({
      id: asset?.storageObjectId,
      keyVersion: 2,
      status: "ready",
    })
    expect(claim).toMatchObject({
      holderId: dto.id,
      holderType: "agent_asset",
      storageObjectId: object?.id,
    })
    expect(usage).toMatchObject({
      organizationId: "asset-org-a",
      temporaryBytes: file.size,
      usedBytes: file.size,
    })
  })

  it("fails closed before DB or R2 work when Agent asset upload is not explicitly enabled", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime({
      ...storage.runtime,
      agentAssetUploadEnabled: undefined,
    })

    const response = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "disabled-upload" })
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: "service_unavailable",
    })
    expect(storage.head).not.toHaveBeenCalled()
    expect(storage.put).not.toHaveBeenCalled()
    expect(await db.select().from(schema.agentAssets)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([])
    expect(await db.select().from(schema.agentResourceUsageBuckets)).toEqual([])
  })

  it("authorizes before calling the private preview Worker and supports ETag revalidation", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "preview-cache" })
    )
    const uploadedAsset = v.parse(agentAssetDtoModel, await uploaded.json())
    const assetId = uploadedAsset.id

    const unauthenticated = await app.handle(
      new Request(
        `http://localhost/files/organizations/asset-org-a/agent-assets/${assetId}/preview/720`
      )
    )
    expect(unauthenticated.status).toBe(401)
    expect(storage.previewFetch).not.toHaveBeenCalled()

    const fixedNow = new Date(uploadedAsset.expiresAt).getTime() - 321_000
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(fixedNow)
    const first = await (async () => {
      try {
        return await app.handle(assetRequest({ assetId }))
      } finally {
        dateNow.mockRestore()
      }
    })()

    expect(first.status).toBe(200)
    expect(first.headers.get("cache-control")).toBe("private, no-cache")
    expect(first.headers.get("content-type")).toBe("image/webp")
    const etag = first.headers.get("etag")
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/u)
    if (!etag) throw new Error("Preview ETag is missing")
    expect(first.headers.get("set-cookie")).toBeNull()
    expect(first.headers.get("x-internal-cache")).toBeNull()
    expect(storage.previewFetch).toHaveBeenCalledTimes(1)
    expect(storage.images.input).not.toHaveBeenCalled()

    const internalRequest = storage.previewFetch.mock.calls[0]?.[0]
    if (!internalRequest) throw new Error("Preview request is missing")
    expect(internalRequest.url).toMatch(
      new RegExp(
        `^https://images\\.internal/v1/previews/agent-asset/asset-org-a/${assetId}/720\\?source=agent-etag-1&variant=webp%3Aq75%3Aanim0%3Av1$`,
        "u"
      )
    )
    expect(internalRequest.url).not.toContain("organizations/")
    expect(internalRequest.headers.get("x-preview-object-key")).toMatch(
      /^organizations\/asset-org-a\/storage-objects\/[0-9a-f-]{36}$/u
    )
    expect(internalRequest.headers.get("x-preview-cache-ttl")).toBe("321")

    const cached = await app.handle(assetRequest({ assetId }))
    expect(cached.status).toBe(200)
    expect(cached.headers.get("etag")).toBe(etag)
    expect(storage.previewFetch).toHaveBeenCalledTimes(2)
    expect(storage.images.input).not.toHaveBeenCalled()

    const revalidated = await app.handle(
      assetRequest({ assetId, ifNoneMatch: etag })
    )
    expect(revalidated.status).toBe(304)
    expect(storage.previewFetch).toHaveBeenCalledTimes(3)

    const unauthorized = await app.handle(
      assetRequest({
        assetId,
        sessionId: "asset-session-b",
        userId: "asset-user-b",
      })
    )
    expect(unauthorized.status).toBe(404)
    expect(storage.previewFetch).toHaveBeenCalledTimes(3)

    await db
      .delete(schema.member)
      .where(eq(schema.member.id, "asset-member-a-a"))
    const membershipRevoked = await app.handle(assetRequest({ assetId }))
    expect(membershipRevoked.status).toBe(404)
    expect(storage.previewFetch).toHaveBeenCalledTimes(3)
  })

  it("converges an identical upload retry and conflicts changed bytes", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    const first = await app.handle(
      uploadRequest({
        file: pngFile("retry.png", { variant: 1 }),
        uploadId: "agent-upload-retry",
      })
    )
    expect(first.status).toBe(201)
    const firstDto = await first.json()

    const retry = await app.handle(
      uploadRequest({
        file: pngFile("retry.png", { variant: 1 }),
        uploadId: "agent-upload-retry",
      })
    )
    expect(retry.status).toBe(200)
    expect(await retry.json()).toEqual(firstDto)
    expect(storage.put).toHaveBeenCalledTimes(1)
    expect(await db.select().from(schema.agentAssets)).toHaveLength(1)
    expect(await db.select().from(schema.storageObjects)).toHaveLength(1)
    expect(await db.select().from(schema.storageObjectClaims)).toHaveLength(1)
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 16, usedBytes: 16 }),
    ])
    const uploadBuckets = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "asset_upload"))
    expect(uploadBuckets).toEqual([{ count: 1 }, { count: 1 }])

    const changed = await app.handle(
      uploadRequest({
        file: pngFile("retry.png", { variant: 2 }),
        uploadId: "agent-upload-retry",
      })
    )
    expect(changed.status).toBe(409)
    expect(await changed.json()).toMatchObject({
      error: "conflict",
    })
    expect(storage.put).toHaveBeenCalledTimes(1)
  })

  it("revalidates live scope for a ready finalize retry and never cleans a concurrently finalized asset", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "finalize-fence" })
    )
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
    const [asset] = await db
      .select()
      .from(schema.agentAssets)
      .where(eq(schema.agentAssets.id, assetId))
    const [object] = await db
      .select()
      .from(schema.storageObjects)
      .where(eq(schema.storageObjects.id, asset?.storageObjectId ?? "missing"))
    const [claim] = await db
      .select()
      .from(schema.storageObjectClaims)
      .where(
        eq(schema.storageObjectClaims.storageObjectId, object?.id ?? "missing")
      )
    if (!asset || !object || !claim || !object.etag) {
      throw new Error("Ready asset fixture is incomplete")
    }

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-b", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    await expect(
      finalizePendingAgentAsset(db, {
        assetId,
        etag: object.etag,
        imageHeight: object.imageHeight ?? -1,
        imageWidth: object.imageWidth ?? -1,
        organizationId: "asset-org-a",
      })
    ).rejects.toMatchObject({
      code: "active_organization_mismatch",
    })
    expect(
      await db
        .select({ status: schema.agentAssets.status })
        .from(schema.agentAssets)
        .where(eq(schema.agentAssets.id, assetId))
    ).toEqual([{ status: "ready" }])

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-a", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    const concurrentlyFinalized = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "concurrent-finalize" })
    )
    const concurrentlyFinalizedAssetId = v.parse(
      agentAssetDtoModel,
      await concurrentlyFinalized.json()
    ).id
    const [concurrentlyFinalizedAsset] = await db
      .select()
      .from(schema.agentAssets)
      .where(eq(schema.agentAssets.id, concurrentlyFinalizedAssetId))
    const [concurrentlyFinalizedObject] = await db
      .select()
      .from(schema.storageObjects)
      .where(
        eq(
          schema.storageObjects.id,
          concurrentlyFinalizedAsset?.storageObjectId ?? "missing"
        )
      )
    const [concurrentlyFinalizedClaim] = await db
      .select()
      .from(schema.storageObjectClaims)
      .where(
        eq(
          schema.storageObjectClaims.storageObjectId,
          concurrentlyFinalizedObject?.id ?? "missing"
        )
      )
    if (
      !concurrentlyFinalizedAsset ||
      !concurrentlyFinalizedObject ||
      !concurrentlyFinalizedClaim
    ) {
      throw new Error("Concurrent finalize fixture is incomplete")
    }
    const stalePendingSnapshot: AgentAssetWithStorage = {
      asset: { ...concurrentlyFinalizedAsset, status: "pending" },
      storage: {
        ...concurrentlyFinalizedObject,
        etag: null,
        imageHeight: null,
        imageWidth: null,
        status: "pending",
      },
      claim: concurrentlyFinalizedClaim,
    }
    storage.setInfo({ format: "png", height: 360, width: 641 })
    await expect(
      reconcilePendingAgentAssetForTest(db, {
        runtime: storage.runtime,
        value: stalePendingSnapshot,
      })
    ).rejects.toMatchObject({ code: "conflict" })

    expect(
      await db
        .select({ status: schema.agentAssets.status })
        .from(schema.agentAssets)
        .where(eq(schema.agentAssets.id, concurrentlyFinalizedAssetId))
    ).toEqual([{ status: "ready" }])
    expect(
      await db
        .select({ status: schema.storageObjects.status })
        .from(schema.storageObjects)
        .where(eq(schema.storageObjects.id, concurrentlyFinalizedObject.id))
    ).toEqual([{ status: "ready" }])
    expect(await db.select().from(schema.storageObjectClaims)).toHaveLength(2)
    expect(await db.select().from(schema.storageObjectCleanupJobs)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 32, usedBytes: 32 }),
    ])
  })

  it("enforces the organization ready cap again inside finalization", async () => {
    const { db } = await createFixture()
    await seedReadyAssetBatch(db, {
      count: AGENT_ASSET_MAX_READY_PER_ORGANIZATION - 1,
      prefix: "ready-cap",
    })
    const now = new Date()
    const reserve = (suffix: string) => {
      const assetId = `cap-pending-${suffix}`
      const storageObjectId = `cap-storage-${suffix}`
      return reservePendingAgentAsset(db, {
        assetId,
        declaredContentType: "image/png",
        detectedImageFormat: "png",
        filename: `${suffix}.png`,
        objectKey: agentAssetObjectKey({
          organizationId: "asset-org-a",
          storageObjectId,
        }),
        organizationId: "asset-org-a",
        sessionId: "asset-session-a",
        sizeBytes: 16,
        storageObjectId,
        threadId: "asset-thread-a",
        uploadId: `cap-upload-${suffix}`,
        uploaderId: "asset-user-a",
        now,
      })
    }
    const first = await reserve("first")
    const second = await reserve("second")

    await finalizePendingAgentAsset(db, {
      assetId: first.value.asset.id,
      etag: "cap-etag-first",
      imageHeight: 1,
      imageWidth: 1,
      organizationId: "asset-org-a",
      now,
    })
    await expect(
      finalizePendingAgentAsset(db, {
        assetId: second.value.asset.id,
        etag: "cap-etag-second",
        imageHeight: 1,
        imageWidth: 1,
        organizationId: "asset-org-a",
        now,
      })
    ).rejects.toMatchObject({
      code: "rate_limited",
    })

    expect(
      await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.agentAssets)
        .where(eq(schema.agentAssets.status, "ready"))
    ).toEqual([{ count: AGENT_ASSET_MAX_READY_PER_ORGANIZATION }])
    expect(
      await db
        .select({ status: schema.agentAssets.status })
        .from(schema.agentAssets)
        .where(eq(schema.agentAssets.id, second.value.asset.id))
    ).toEqual([{ status: "pending" }])
    expect(
      await db
        .select({ status: schema.storageObjects.status })
        .from(schema.storageObjects)
        .where(eq(schema.storageObjects.id, second.value.storage.id))
    ).toEqual([{ status: "pending" }])
  })

  it("rejects MIME, signature, unsupported, oversize, and quota violations before R2", async () => {
    const { db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    const invalid = [
      pngFile("mismatch.jpg", { type: "image/jpeg" }),
      new File(["not-an-image"], "fake.png", { type: "image/png" }),
      new File(
        [new Uint8Array([0, 0, 0, 24]), "ftyp", "avif"],
        "unsupported.avif",
        { type: "image/avif" }
      ),
      pngFile("too-large.png", { size: AGENT_ASSET_MAX_BYTES + 1 }),
    ]
    for (const [index, file] of invalid.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- each rejected case must leave the same DB/R2 baseline.
      await expect(
        uploadDirect(db, file, `invalid-${index}`)
      ).rejects.toMatchObject({ code: "validation_error" })
    }
    expect(storage.put).not.toHaveBeenCalled()
    expect(await db.select().from(schema.storageObjects)).toEqual([])
    expect(await db.select().from(schema.agentAssets)).toEqual([])

    const quotaFile = pngFile("quota.png")
    await db.insert(schema.organizationFileUsage).values({
      organizationId: "asset-org-a",
      usedBytes: ORGANIZATION_FILE_QUOTA_BYTES - quotaFile.size + 1,
      temporaryBytes: 0,
      updatedAt: new Date(),
    })
    await expect(
      uploadDirect(db, quotaFile, "quota-rejected")
    ).rejects.toMatchObject({ code: "rate_limited" })
    expect(storage.put).not.toHaveBeenCalled()
    expect(await db.select().from(schema.storageObjects)).toEqual([])
    const [usage] = await db.select().from(schema.organizationFileUsage)
    expect(usage?.usedBytes).toBe(
      ORGANIZATION_FILE_QUOTA_BYTES - quotaFile.size + 1
    )
  })
})
