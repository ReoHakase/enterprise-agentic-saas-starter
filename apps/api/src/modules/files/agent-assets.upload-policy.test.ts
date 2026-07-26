import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq, sql } from "drizzle-orm"
import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  AGENT_USAGE_DAY_MS,
  AGENT_USAGE_HOUR_MS,
  consumeAgentResourceLimitInTransaction,
  createAgentInternalApi,
  startAgentRun,
  utcUsageWindow,
} from "../agent/public"
import { processAgentAssetLifecycle } from "./agent-assets-cleanup"
import {
  assetRequest,
  createFixture,
  createRuntime,
  openConnection,
  pngFile,
  seedReadyAsset,
  uploadDirect,
  uploadRequest,
} from "./agent-assets.test-support"
import {
  AGENT_ASSET_MAX_DIMENSION,
  AGENT_ASSET_MODEL_MAX_BYTES,
  AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT,
} from "./constants"
import { agentAssetDtoModel } from "./model"
import { configureFileStorageRuntime } from "./runtime"

describe("Agent asset upload policy and scope", () => {
  it("atomically rate-limits a new upload without consuming storage quota", async () => {
    const { db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const now = new Date()
    const window = utcUsageWindow(now, AGENT_USAGE_HOUR_MS)
    await db.transaction(async (tx) => {
      for (
        let index = 0;
        index < AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT;
        index += 1
      ) {
        // oxlint-disable-next-line no-await-in-loop -- one bucket must deterministically reach its exact limit.
        await consumeAgentResourceLimitInTransaction(tx, {
          kind: "asset_upload",
          limitCount: AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT,
          now,
          operationId: `seed-upload-${index}`,
          organizationId: "asset-org-a",
          userId: "asset-user-a",
          ...window,
        })
      }
    })

    await expect(
      uploadDirect(db, pngFile(), "rate-limited-upload")
    ).rejects.toMatchObject({ code: "rate_limited", statusCode: 429 })
    expect(storage.put).not.toHaveBeenCalled()
    expect(await db.select().from(schema.storageObjects)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([])
    expect(
      await db
        .select({ count: schema.agentResourceUsageBuckets.count })
        .from(schema.agentResourceUsageBuckets)
    ).toEqual([{ count: AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT }])
  })

  it("purges expired usage buckets and operation ledgers from the scheduled lifecycle after grace", async () => {
    const { db } = await createFixture()
    const storage = createRuntime()
    const scheduledNow = new Date("2026-07-22T12:00:00.000Z")
    const expiredWindow = utcUsageWindow(
      new Date(
        scheduledNow.getTime() - AGENT_USAGE_DAY_MS - 2 * AGENT_USAGE_DAY_MS
      ),
      AGENT_USAGE_DAY_MS
    )
    const retainedWindow = utcUsageWindow(
      new Date(scheduledNow.getTime() - 12 * AGENT_USAGE_HOUR_MS),
      AGENT_USAGE_DAY_MS
    )
    await db.transaction(async (tx) => {
      await consumeAgentResourceLimitInTransaction(tx, {
        kind: "asset_upload",
        limitCount: 10,
        now: expiredWindow.windowStart,
        operationId: "expired-operation",
        organizationId: "asset-org-a",
        userId: "asset-user-a",
        ...expiredWindow,
      })
      await consumeAgentResourceLimitInTransaction(tx, {
        kind: "asset_upload",
        limitCount: 10,
        now: retainedWindow.windowStart,
        operationId: "retained-operation",
        organizationId: "asset-org-a",
        userId: "asset-user-a",
        ...retainedWindow,
      })
    })

    const result = await processAgentAssetLifecycle({
      bucket: storage.bucket,
      database: db,
      now: scheduledNow,
    })

    expect(result.usagePurge).toEqual({
      bucketsDeleted: 1,
      operationsDeleted: 1,
    })
    expect(
      await db
        .select({ windowStart: schema.agentResourceUsageBuckets.windowStart })
        .from(schema.agentResourceUsageBuckets)
    ).toEqual([{ windowStart: retainedWindow.windowStart }])
    expect(
      await db
        .select({
          operationId: schema.agentResourceUsageOperations.operationId,
        })
        .from(schema.agentResourceUsageOperations)
    ).toEqual([{ operationId: "retained-operation" }])
  })

  it("rejects Images signature/dimension metadata after PUT and durably queues exact cleanup", async () => {
    const { db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    storage.setInfo({ format: "jpeg" })
    await expect(
      uploadDirect(db, pngFile("format.png"), "images-format-mismatch")
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })

    storage.setInfo({ format: "png", width: AGENT_ASSET_MAX_DIMENSION + 1 })
    await expect(
      uploadDirect(db, pngFile("dimensions.png"), "images-dimensions")
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })

    expect(storage.put).toHaveBeenCalledTimes(2)
    const assets = await db.select().from(schema.agentAssets)
    const objects = await db.select().from(schema.storageObjects)
    const jobs = await db.select().from(schema.storageObjectCleanupJobs)
    expect(assets).toHaveLength(2)
    expect(assets.every(({ status }) => status === "expired")).toBe(true)
    expect(
      assets.every(({ storageObjectId }) => storageObjectId === null)
    ).toBe(true)
    expect(objects.every(({ status }) => status === "deleting")).toBe(true)
    expect(jobs).toHaveLength(2)
    expect(
      jobs.every(({ objectKey, storageObjectId }) =>
        objectKey.endsWith(`/storage-objects/${storageObjectId}`)
      )
    ).toBe(true)
    expect(await db.select().from(schema.storageObjectClaims)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 0, usedBytes: 0 }),
    ])
  })

  it("hides other-owner/tenant assets and fails closed after organization or epoch changes", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    const otherOwnerUpload = await app.handle(
      uploadRequest({
        file: pngFile(),
        threadId: "asset-thread-other-owner",
        uploadId: "other-owner-thread",
      })
    )
    expect(otherOwnerUpload.status).toBe(404)
    const otherTenantUpload = await app.handle(
      uploadRequest({
        activeOrganizationId: "asset-org-b",
        file: pngFile(),
        organizationId: "asset-org-b",
        sessionId: "asset-session-b",
        threadId: "asset-thread-b",
        uploadId: "other-tenant-thread",
        userId: "asset-user-b",
      })
    )
    expect(otherTenantUpload.status).toBe(404)

    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "private-asset" })
    )
    expect(uploaded.status).toBe(201)
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id

    const otherOwnerRead = await app.handle(
      assetRequest({
        assetId,
        sessionId: "asset-session-b",
        userId: "asset-user-b",
      })
    )
    const otherTenantRead = await app.handle(
      assetRequest({
        activeOrganizationId: "asset-org-b",
        assetId,
        organizationId: "asset-org-b",
        sessionId: "asset-session-a-org-b",
      })
    )
    expect(otherOwnerRead.status).toBe(404)
    expect(otherTenantRead.status).toBe(404)

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-b", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    const switched = await app.handle(assetRequest({ assetId }))
    expect(switched.status).toBe(409)
    expect(await switched.json()).toMatchObject({
      error: { code: "active_organization_mismatch" },
    })

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-a", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    const epochInvalidated = await app.handle(assetRequest({ assetId }))
    expect(epochInvalidated.status).toBe(401)
    expect(storage.images.input).not.toHaveBeenCalled()
  })

  it("binds only the selected run assets and fences model image output at WebP 4 MiB", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "model-asset" })
    )
    expect(uploaded.status).toBe(201)
    const uploadedAssetId = v.parse(
      agentAssetDtoModel,
      await uploaded.json()
    ).id
    const connection = await openConnection(db)
    const internal = await createAgentInternalApi(db)
    const run = await internal.startRun({
      grant: connection.grant,
      clientMessageId: "model-image-run",
      assetIds: [uploadedAssetId],
    })
    const bindings = await db
      .select()
      .from(schema.agentRunAssets)
      .where(eq(schema.agentRunAssets.runId, run.runId))
    expect(bindings).toEqual([
      expect.objectContaining({
        assetId: uploadedAssetId,
        sizeBytes: 16,
      }),
    ])

    const modelImage = await internal.getAgentImageForModel({
      grant: run.grant,
      assetId: uploadedAssetId,
    })
    expect(modelImage.status).toBe(200)
    expect(modelImage.headers.get("content-type")).toBe("image/webp")
    expect(modelImage.headers.get("cache-control")).toBe("private, no-store")
    expect(modelImage.headers.get("content-length")).toBe("6")
    expect(new Uint8Array(await modelImage.arrayBuffer())).toEqual(
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x57, 0x45])
    )
    expect(storage.images.transform).toHaveBeenLastCalledWith({
      fit: "scale-down",
      width: 2048,
    })
    expect(storage.images.output).toHaveBeenLastCalledWith({
      anim: false,
      format: "image/webp",
      quality: 75,
    })

    storage.setOutput({
      bytes: new Uint8Array(AGENT_ASSET_MODEL_MAX_BYTES + 1),
      contentLength: null,
    })
    await expect(
      internal.getAgentImageForModel({
        grant: run.grant,
        assetId: uploadedAssetId,
      })
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })

    storage.setOutput({
      bytes: new Uint8Array([1]),
      contentType: "image/png",
    })
    await expect(
      internal.getAgentImageForModel({
        grant: run.grant,
        assetId: uploadedAssetId,
      })
    ).rejects.toMatchObject({ code: "service_unavailable", statusCode: 503 })
    const visionBuckets = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "vision_transform"))
    expect(visionBuckets).toEqual([{ count: 1 }, { count: 1 }])
    await internal.finishRun({ grant: run.grant, outcome: "completed" })

    const seededIds: string[] = []
    for (let index = 0; index < 5; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- libSQL has one writer; fixture order is intentional.
      const seededId = await seedReadyAsset(db, {
        id: `count-asset-${index}`,
        sizeBytes: 1,
      })
      seededIds.push(seededId)
    }
    const countConnection = await openConnection(db)
    await expect(
      startAgentRun(db, {
        grant: countConnection.grant,
        clientMessageId: "too-many-assets",
        assetIds: seededIds,
      })
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })

    const largeIds: string[] = []
    for (let index = 0; index < 3; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- libSQL has one writer; fixture order is intentional.
      const seededId = await seedReadyAsset(db, {
        id: `large-asset-${index}`,
        sizeBytes: 7_000_000,
      })
      largeIds.push(seededId)
    }
    const byteConnection = await openConnection(db)
    await expect(
      startAgentRun(db, {
        grant: byteConnection.grant,
        clientMessageId: "too-many-bytes",
        assetIds: largeIds,
      })
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })
    const failedRuns = await db
      .select()
      .from(schema.agentRuns)
      .where(
        sql`${schema.agentRuns.clientMessageId} in ('too-many-assets', 'too-many-bytes')`
      )
    expect(failedRuns).toEqual([])
  })
})
