import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  processAgentAssetLifecycle,
  processStorageObjectCleanupJobs,
} from "./agent-assets-cleanup"
import {
  assetRequest,
  createFixture,
  createRuntime,
  pngFile,
  uploadRequest,
} from "./agent-assets.test-support"
import { agentAssetDtoModel } from "./model"
import { configureFileStorageRuntime } from "./runtime"

describe("Agent assetの期限切れと削除fence", () => {
  it("chat限定assetを期限切れにしてusageとpreviewを無効化する", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "expiring-asset" })
    )
    expect(uploaded.status).toBe(201)
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
    const [asset] = await db.select().from(schema.agentAssets)
    const expiry = asset?.expiresAt ?? new Date(0)

    const result = await processAgentAssetLifecycle({
      bucket: storage.bucket,
      database: db,
      now: new Date(expiry.getTime() + 1),
    })
    expect(result).toMatchObject({
      expiry: { considered: 1, expired: 1 },
      cleanup: { claimed: 1, completed: 1, failed: 0 },
    })
    expect(storage.deletedKeys).toHaveLength(1)
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 0, usedBytes: 0 }),
    ])
    const expiredPreview = await app.handle(assetRequest({ assetId }))
    expect(expiredPreview.status).toBe(404)
    expect(storage.previewFetch).not.toHaveBeenCalled()
  })

  it("cleanup fence不一致でR2を削除しない", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "tampered-cleanup" })
    )
    expect(uploaded.status).toBe(201)
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
    expect(
      (await app.handle(assetRequest({ assetId, method: "DELETE" }))).status
    ).toBe(204)
    const [pendingJob] = await db
      .select()
      .from(schema.storageObjectCleanupJobs)
      .where(eq(schema.storageObjectCleanupJobs.status, "pending"))
    expect(pendingJob).toBeTruthy()
    await db
      .update(schema.storageObjects)
      .set({ objectKey: null, status: "deleted", updatedAt: new Date() })
      .where(
        eq(schema.storageObjects.id, pendingJob?.storageObjectId ?? "missing")
      )
    const deletesBefore = storage.deletedKeys.length
    const failures: Array<{ attempts: number; errorCode: string }> = []
    const cleanup = await processStorageObjectCleanupJobs({
      bucket: storage.bucket,
      database: db,
      now: new Date(),
      onFailure: (failure) => failures.push(failure),
    })
    expect(cleanup).toMatchObject({ claimed: 1, completed: 0, failed: 1 })
    expect(storage.deletedKeys).toHaveLength(deletesBefore)
    expect(failures).toEqual([
      { attempts: 1, errorCode: "cleanup_fence_mismatch" },
    ])
    expect(
      await db
        .select({ error: schema.storageObjectCleanupJobs.lastErrorCode })
        .from(schema.storageObjectCleanupJobs)
        .where(eq(schema.storageObjectCleanupJobs.id, pendingJob?.id ?? ""))
    ).toEqual([{ error: "cleanup_fence_mismatch" }])
  })
})
