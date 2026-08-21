import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq, sql } from "drizzle-orm"
import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { decideAgentActionForSession } from "../agent/actions/repository"
import {
  AGENT_USAGE_DAY_MS,
  AGENT_USAGE_HOUR_MS,
  consumeAgentResourceLimitInTransaction,
  createAgentInternalApi,
  issueAgentConnectionTicket,
  utcUsageWindow,
} from "../agent/public"
import { processAgentAssetLifecycle } from "./agent-assets-cleanup"
import {
  assetRequest,
  createFixture,
  createRuntime,
  pngFile,
  seedReadyAsset,
  startAssetChatRun,
  uploadDirect,
  uploadRequest,
} from "./agent-assets.test-support"
import { listReusableAgentAssetsInTransaction } from "./agent-run-assets-repository"
import {
  AGENT_ASSET_MAX_DIMENSION,
  AGENT_ASSET_MODEL_MAX_BYTES,
  AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT,
  AGENT_RUN_ASSET_MAX_BYTES,
} from "./constants"
import { agentAssetDtoModel } from "./model"
import { configureFileStorageRuntime } from "./runtime"

type CombinedImageScenario = {
  currentSizes: readonly number[]
  name: string
  reusableSizes: readonly number[]
}

const successfulCombinedImageScenarios: readonly CombinedImageScenario[] = [
  {
    currentSizes: [1, 1],
    name: "count below the limit",
    reusableSizes: [1],
  },
  {
    currentSizes: [1, 1, 1],
    name: "count at the limit",
    reusableSizes: [1],
  },
  {
    currentSizes: [10_000_000],
    name: "bytes below the limit",
    reusableSizes: [AGENT_RUN_ASSET_MAX_BYTES - 10_000_001],
  },
  {
    currentSizes: [10_000_000],
    name: "bytes at the limit",
    reusableSizes: [AGENT_RUN_ASSET_MAX_BYTES - 10_000_000],
  },
]

const rejectedCombinedImageScenarios: readonly CombinedImageScenario[] = [
  {
    currentSizes: [1, 1, 1],
    name: "count above the limit",
    reusableSizes: [1, 1],
  },
  {
    currentSizes: [10_000_000, 1],
    name: "bytes above the limit",
    reusableSizes: [AGENT_RUN_ASSET_MAX_BYTES - 10_000_000],
  },
]

const seedSizedAssets = (
  db: Parameters<typeof seedReadyAsset>[0],
  input: {
    prefix: string
    sizes: readonly number[]
  }
) =>
  input.sizes.reduce<Promise<string[]>>(
    async (pendingAssetIds, sizeBytes, index) => [
      ...(await pendingAssetIds),
      await seedReadyAsset(db, {
        id: `${input.prefix}-${index}`,
        sizeBytes,
      }),
    ],
    Promise.resolve([])
  )

const createCombinedImageScenario = async ({
  currentSizes,
  name,
  reusableSizes,
}: CombinedImageScenario) => {
  const { db } = await createFixture()
  const internal = await createAgentInternalApi(db)
  const slug = name.replaceAll(" ", "-")
  const reusableAssetIds = await seedSizedAssets(db, {
    prefix: `combined-${slug}-past`,
    sizes: reusableSizes,
  })
  const priorRun = (
    await startAssetChatRun(db, {
      assetIds: reusableAssetIds,
      clientMessageId: `combined-${slug}-prior`,
    })
  ).run
  await internal.finalizeRun({
    grant: priorRun.grant,
    outcome: "completed",
  })
  const currentAssetIds = await seedSizedAssets(db, {
    prefix: `combined-${slug}-current`,
    sizes: currentSizes,
  })
  const now = new Date()
  const issueId = `combined-${slug}-issue`
  await db.insert(schema.issues).values({
    id: issueId,
    organizationId: "asset-org-a",
    number: 1,
    title: "Combined image boundary",
    description: "",
    status: "open",
    priority: "no_priority",
    creatorId: "asset-user-a",
    labels: [],
    createdAt: now,
    updatedAt: now,
  })
  const run = (
    await startAssetChatRun(db, {
      assetIds: currentAssetIds,
      clientMessageId: `combined-${slug}-current`,
    })
  ).run
  return {
    currentAssetIds,
    db,
    prepare: () =>
      internal.prepareUpdateIssue({
        grant: run.grant,
        idempotencyKey: `combined-${slug}-key`,
        issue: {
          operation: "add_attachments",
          attachmentAssetIds: reusableAssetIds,
          expectedRevision: 1,
          issueId,
        },
        toolCallId: `combined-${slug}-call`,
      }),
    reusableAssetIds,
    runId: run.runId,
  }
}

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
    ).rejects.toMatchObject({ code: "rate_limited" })
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
    ).rejects.toMatchObject({ code: "validation_error" })

    storage.setInfo({ format: "png", width: AGENT_ASSET_MAX_DIMENSION + 1 })
    await expect(
      uploadDirect(db, pngFile("dimensions.png"), "images-dimensions")
    ).rejects.toMatchObject({ code: "validation_error" })

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
      error: "active_organization_mismatch",
    })

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-a", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    const epochInvalidated = await app.handle(assetRequest({ assetId }))
    expect(epochInvalidated.status).toBe(401)
    expect(storage.previewFetch).not.toHaveBeenCalled()
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
    const internal = await createAgentInternalApi(db)
    const run = (
      await startAssetChatRun(db, {
        clientMessageId: "model-image-run",
        assetIds: [uploadedAssetId],
      })
    ).run
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
    ).rejects.toMatchObject({ code: "validation_error" })

    storage.setOutput({
      bytes: new Uint8Array([1]),
      contentType: "image/png",
    })
    await expect(
      internal.getAgentImageForModel({
        grant: run.grant,
        assetId: uploadedAssetId,
      })
    ).rejects.toMatchObject({ code: "service_unavailable" })
    const visionBuckets = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "vision_transform"))
    expect(visionBuckets).toEqual([{ count: 1 }, { count: 1 }])
    await internal.finalizeRun({ grant: run.grant, outcome: "completed" })

    const seededIds: string[] = []
    for (let index = 0; index < 5; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- libSQL has one writer; fixture order is intentional.
      const seededId = await seedReadyAsset(db, {
        id: `count-asset-${index}`,
        sizeBytes: 1,
      })
      seededIds.push(seededId)
    }
    const countTicket = await issueAgentConnectionTicket(db, {
      sessionId: "asset-session-a",
      threadId: "asset-thread-a",
      userId: "asset-user-a",
    })
    await expect(
      internal.startChatRun({
        clientMessageId: "too-many-assets",
        assetIds: seededIds,
        threadId: "asset-thread-a",
        ticket: countTicket.ticket,
      })
    ).rejects.toMatchObject({ code: "validation_error" })

    const largeIds: string[] = []
    for (let index = 0; index < 3; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- libSQL has one writer; fixture order is intentional.
      const seededId = await seedReadyAsset(db, {
        id: `large-asset-${index}`,
        sizeBytes: 7_000_000,
      })
      largeIds.push(seededId)
    }
    const byteTicket = await issueAgentConnectionTicket(db, {
      sessionId: "asset-session-a",
      threadId: "asset-thread-a",
      userId: "asset-user-a",
    })
    await expect(
      internal.startChatRun({
        clientMessageId: "too-many-bytes",
        assetIds: largeIds,
        threadId: "asset-thread-a",
        ticket: byteTicket.ticket,
      })
    ).rejects.toMatchObject({ code: "validation_error" })
    const failedRuns = await db
      .select()
      .from(schema.agentRuns)
      .where(
        sql`${schema.agentRuns.clientMessageId} in ('too-many-assets', 'too-many-bytes')`
      )
    expect(failedRuns).toEqual([])
  })
})

describe("Agent reusable asset boundaries", () => {
  it.each(successfulCombinedImageScenarios)(
    "accepts the combined current and reusable image $name",
    async (scenario) => {
      const { currentAssetIds, db, prepare, reusableAssetIds, runId } =
        await createCombinedImageScenario(scenario)
      const action = await prepare()

      expect(action.status).toBe("pending")
      expect(
        await db
          .select()
          .from(schema.agentActionAssets)
          .where(eq(schema.agentActionAssets.actionId, action.id))
      ).toHaveLength(reusableAssetIds.length)
      const runAssetIds = await db
        .select({ assetId: schema.agentRunAssets.assetId })
        .from(schema.agentRunAssets)
        .where(eq(schema.agentRunAssets.runId, runId))
      expect(runAssetIds.map(({ assetId }) => assetId).toSorted()).toEqual(
        [...currentAssetIds, ...reusableAssetIds].toSorted()
      )
    }
  )

  it.each(rejectedCombinedImageScenarios)(
    "rejects the combined current and reusable image $name before action mutation",
    async (scenario) => {
      const { currentAssetIds, db, prepare, runId } =
        await createCombinedImageScenario(scenario)

      await expect(prepare()).rejects.toMatchObject({
        code: "validation_error",
      })
      expect(await db.select().from(schema.agentActions)).toEqual([])
      expect(await db.select().from(schema.agentActionAssets)).toEqual([])
      const runAssetIds = await db
        .select({ assetId: schema.agentRunAssets.assetId })
        .from(schema.agentRunAssets)
        .where(eq(schema.agentRunAssets.runId, runId))
      expect(runAssetIds.map(({ assetId }) => assetId).toSorted()).toEqual(
        currentAssetIds.toSorted()
      )
    }
  )

  it("lists every retained image from the same conversation and binds only the selected past image", async () => {
    const { db } = await createFixture()
    const internal = await createAgentInternalApi(db)
    const assetIds = await Array.from({ length: 6 }).reduce<Promise<string[]>>(
      async (pendingAssetIds, _, index) => {
        const seededAssetIds = await pendingAssetIds
        return [
          ...seededAssetIds,
          await seedReadyAsset(db, {
            id: `conversation-asset-${index}`,
            sizeBytes: 1,
          }),
        ]
      },
      Promise.resolve([])
    )
    await assetIds.reduce<Promise<void>>(
      (previous, assetId, index) =>
        previous.then(() =>
          startAssetChatRun(db, {
            assetIds: [assetId],
            clientMessageId: `conversation-message-${index}`,
          })
            .then(({ run }) =>
              internal.finalizeRun({
                grant: run.grant,
                outcome: "completed",
              })
            )
            .then(() => undefined)
        ),
      Promise.resolve()
    )

    const reusable = await db.transaction((tx) =>
      listReusableAgentAssetsInTransaction(tx, {
        currentAssetIds: [],
        now: new Date(),
        scope: {
          contextEpoch: 1,
          organizationId: "asset-org-a",
          sessionId: "asset-session-a",
          threadId: "asset-thread-a",
          userId: "asset-user-a",
        },
      })
    )
    expect(reusable).toHaveLength(6)
    expect(reusable.map(({ id }) => id)).toEqual(
      expect.arrayContaining(assetIds)
    )

    const now = new Date()
    await db.insert(schema.issues).values({
      id: "conversation-target-issue",
      organizationId: "asset-org-a",
      number: 1,
      title: "Conversation image target",
      description: "",
      status: "open",
      priority: "no_priority",
      creatorId: "asset-user-a",
      labels: [],
      createdAt: now,
      updatedAt: now,
    })
    const run = (
      await startAssetChatRun(db, {
        assetIds: [],
        clientMessageId: "conversation-reuse-message",
      })
    ).run
    const action = await internal.prepareUpdateIssue({
      grant: run.grant,
      idempotencyKey: "conversation-reuse-idempotency-key",
      issue: {
        operation: "add_attachments",
        attachmentAssetIds: [assetIds[0] ?? ""],
        expectedRevision: 1,
        issueId: "conversation-target-issue",
      },
      toolCallId: "conversation-reuse-tool-call",
    })
    expect(action.preview?.attachments).toEqual([
      expect.objectContaining({
        assetId: assetIds[0],
        filename: `${assetIds[0]}.png`,
      }),
    ])
    expect(
      await db
        .select({ assetId: schema.agentRunAssets.assetId })
        .from(schema.agentRunAssets)
        .where(eq(schema.agentRunAssets.runId, run.runId))
    ).toEqual([{ assetId: assetIds[0] }])

    expect(action.status).toBe("pending")
    await expect(
      decideAgentActionForSession(db, {
        actionId: action.id,
        decision: "no",
        idempotencyKey: "conversation-reject-decision-key",
        sessionId: "asset-session-a",
        userId: "asset-user-a",
      })
    ).resolves.toMatchObject({ status: "rejected" })

    const retryRun = (
      await startAssetChatRun(db, {
        assetIds: [],
        clientMessageId: "conversation-reuse-after-reject",
      })
    ).run
    await expect(
      internal.prepareUpdateIssue({
        grant: retryRun.grant,
        idempotencyKey: "conversation-reuse-after-reject-key",
        issue: {
          operation: "add_attachments",
          attachmentAssetIds: [assetIds[0] ?? ""],
          expectedRevision: 1,
          issueId: "conversation-target-issue",
        },
        toolCallId: "conversation-reuse-after-reject-call",
      })
    ).resolves.toMatchObject({
      preview: {
        attachments: [expect.objectContaining({ assetId: assetIds[0] })],
      },
      status: "pending",
    })
  })
})
