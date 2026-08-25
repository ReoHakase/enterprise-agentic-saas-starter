import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
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
  id: string
  label: string
  reusableSizes: readonly number[]
}

const successfulCombinedImageScenarios: readonly CombinedImageScenario[] = [
  {
    currentSizes: [1, 1],
    id: "count-below-limit",
    label: "件数が上限未満の場合",
    reusableSizes: [1],
  },
  {
    currentSizes: [1, 1, 1],
    id: "count-at-limit",
    label: "件数が上限と一致する場合",
    reusableSizes: [1],
  },
  {
    currentSizes: [10_000_000],
    id: "bytes-below-limit",
    label: "byte数が上限未満の場合",
    reusableSizes: [AGENT_RUN_ASSET_MAX_BYTES - 10_000_001],
  },
  {
    currentSizes: [10_000_000],
    id: "bytes-at-limit",
    label: "byte数が上限と一致する場合",
    reusableSizes: [AGENT_RUN_ASSET_MAX_BYTES - 10_000_000],
  },
]

const rejectedCombinedImageScenarios: readonly CombinedImageScenario[] = [
  {
    currentSizes: [1, 1, 1],
    id: "count-above-limit",
    label: "件数が上限を超える場合",
    reusableSizes: [1, 1],
  },
  {
    currentSizes: [10_000_000, 1],
    id: "bytes-above-limit",
    label: "byte数が上限を超える場合",
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
  id,
  reusableSizes,
}: CombinedImageScenario) => {
  const { db } = await createFixture()
  const internal = await createAgentInternalApi(db)
  const slug = id
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

const createModelImageFixture = async (id: string) => {
  const { app, db } = await createFixture()
  const storage = createRuntime()
  configureFileStorageRuntime(storage.runtime)
  const uploaded = await app.handle(
    uploadRequest({ file: pngFile(), uploadId: `${id}-upload` })
  )
  const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
  const internal = await createAgentInternalApi(db)
  const run = (
    await startAssetChatRun(db, {
      assetIds: [assetId],
      clientMessageId: `${id}-run`,
    })
  ).run

  return { assetId, db, internal, run, storage }
}

const seedReusableConversationAssets = async (
  db: Parameters<typeof seedReadyAsset>[0],
  internal: Awaited<ReturnType<typeof createAgentInternalApi>>,
  count = 6
) =>
  Array.from({ length: count }).reduce<Promise<string[]>>(
    async (pendingAssetIds, _, index) => {
      const assetIds = await pendingAssetIds
      const assetId = await seedReadyAsset(db, {
        id: `conversation-asset-${index}`,
        sizeBytes: 1,
      })
      const priorRun = (
        await startAssetChatRun(db, {
          assetIds: [assetId],
          clientMessageId: `conversation-message-${index}`,
        })
      ).run
      await internal.finalizeRun({
        grant: priorRun.grant,
        outcome: "completed",
      })
      return [...assetIds, assetId]
    },
    Promise.resolve([])
  )

const seedConversationTargetIssue = async (
  db: Parameters<typeof seedReadyAsset>[0]
) => {
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
}

describe("Agent asset upload policyとscope", () => {
  it("storage quotaをconsumeせず新規uploadを原子的にrate limitする", async () => {
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
        // oxlint-disable-next-line no-await-in-loop -- 1つのbucketを決定的に正確な上限へ到達させる
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

  it("猶予後のscheduled lifecycleで期限切れusage bucketとoperation ledgerを削除する", async () => {
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

  it.each([
    {
      fileName: "format.png",
      info: { format: "jpeg" },
      label: "signatureと異なるformat metadata",
      uploadId: "images-format-mismatch",
    },
    {
      fileName: "dimensions.png",
      info: { format: "png", width: AGENT_ASSET_MAX_DIMENSION + 1 },
      label: "上限を超えるdimension metadata",
      uploadId: "images-dimensions",
    },
  ] as const)(
    "PUT後に$labelを拒否してexact cleanupを永続queueへ積む",
    async ({ fileName, info, uploadId }) => {
      const { db } = await createFixture()
      const storage = createRuntime()
      configureFileStorageRuntime(storage.runtime)
      storage.setInfo(info)

      await expect(
        uploadDirect(db, pngFile(fileName), uploadId)
      ).rejects.toMatchObject({ code: "validation_error" })

      expect(storage.put).toHaveBeenCalledTimes(1)
      const assets = await db.select().from(schema.agentAssets)
      const objects = await db.select().from(schema.storageObjects)
      const jobs = await db.select().from(schema.storageObjectCleanupJobs)
      expect(assets).toEqual([
        expect.objectContaining({ status: "expired", storageObjectId: null }),
      ])
      expect(objects).toEqual([expect.objectContaining({ status: "deleting" })])
      expect(jobs).toHaveLength(1)
      expect(
        jobs[0]?.objectKey.endsWith(
          `/storage-objects/${jobs[0]?.storageObjectId}`
        )
      ).toBe(true)
      expect(await db.select().from(schema.storageObjectClaims)).toEqual([])
      expect(await db.select().from(schema.organizationFileUsage)).toEqual([
        expect.objectContaining({ temporaryBytes: 0, usedBytes: 0 }),
      ])
    }
  )

  it.each([
    {
      input: {
        file: pngFile(),
        threadId: "asset-thread-other-owner",
        uploadId: "other-owner-thread",
      },
      label: "別ownerのthread",
    },
    {
      input: {
        activeOrganizationId: "asset-org-b",
        file: pngFile(),
        organizationId: "asset-org-b",
        sessionId: "asset-session-b",
        threadId: "asset-thread-b",
        uploadId: "other-tenant-thread",
        userId: "asset-user-b",
      },
      label: "別tenantのthread",
    },
  ] as const)("$labelへのuploadを404で隠す", async ({ input }) => {
    const { app } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    const response = await app.handle(uploadRequest(input))

    expect(response.status).toBe(404)
    expect(storage.put).not.toHaveBeenCalled()
  })

  it.each([
    {
      input: {
        sessionId: "asset-session-b",
        userId: "asset-user-b",
      },
      label: "別owner",
    },
    {
      input: {
        activeOrganizationId: "asset-org-b",
        organizationId: "asset-org-b",
        sessionId: "asset-session-a-org-b",
      },
      label: "別tenant",
    },
  ] as const)("$labelからのasset readを404で隠す", async ({ input }) => {
    const { app } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "private-asset-read" })
    )
    expect(uploaded.status).toBe(201)
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
    storage.previewFetch.mockClear()

    const response = await app.handle(assetRequest({ assetId, ...input }))

    expect(response.status).toBe(404)
    expect(storage.previewFetch).not.toHaveBeenCalled()
  })

  it("active organization変更後のasset readを409で拒否する", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "private-asset-switch" })
    )
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
    storage.previewFetch.mockClear()

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-b", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    const switched = await app.handle(assetRequest({ assetId }))
    expect(switched.status).toBe(409)
    expect(await switched.json()).toMatchObject({
      error: "active_organization_mismatch",
    })
    expect(storage.previewFetch).not.toHaveBeenCalled()
  })

  it("context epoch変更後のasset readを401で拒否する", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "private-asset-epoch" })
    )
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-b", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-a", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    storage.previewFetch.mockClear()
    const epochInvalidated = await app.handle(assetRequest({ assetId }))
    expect(epochInvalidated.status).toBe(401)
    expect(storage.previewFetch).not.toHaveBeenCalled()
  })

  it("選択run assetだけをbindingしてmodel画像をWebPへ変換する", async () => {
    const { assetId, db, internal, run, storage } =
      await createModelImageFixture("model-image-success")
    const bindings = await db
      .select()
      .from(schema.agentRunAssets)
      .where(eq(schema.agentRunAssets.runId, run.runId))
    expect(bindings).toEqual([
      expect.objectContaining({
        assetId,
        sizeBytes: 16,
      }),
    ])

    const modelImage = await internal.getAgentImageForModel({
      grant: run.grant,
      assetId,
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
    expect(
      await db
        .select({ count: schema.agentResourceUsageBuckets.count })
        .from(schema.agentResourceUsageBuckets)
        .where(eq(schema.agentResourceUsageBuckets.kind, "vision_transform"))
    ).toEqual([{ count: 1 }, { count: 1 }])
  })

  it("4 MiBを超えるmodel画像出力を拒否する", async () => {
    const { assetId, internal, run, storage } =
      await createModelImageFixture("model-image-size")
    storage.setOutput({
      bytes: new Uint8Array(AGENT_ASSET_MODEL_MAX_BYTES + 1),
      contentLength: null,
    })
    await expect(
      internal.getAgentImageForModel({
        grant: run.grant,
        assetId,
      })
    ).rejects.toMatchObject({ code: "validation_error" })
  })

  it("WebP以外のmodel画像出力を拒否する", async () => {
    const { assetId, internal, run, storage } = await createModelImageFixture(
      "model-image-content-type"
    )
    storage.setOutput({
      bytes: new Uint8Array([1]),
      contentType: "image/png",
    })
    await expect(
      internal.getAgentImageForModel({
        grant: run.grant,
        assetId,
      })
    ).rejects.toMatchObject({ code: "service_unavailable" })
  })

  it("上限を超える件数のrun assetを拒否する", async () => {
    const { db } = await createFixture()
    const internal = await createAgentInternalApi(db)
    const seededIds: string[] = []
    for (let index = 0; index < 5; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- libSQLはwriterが1つでfixture順序を意図している
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
    expect(
      await db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.clientMessageId, "too-many-assets"))
    ).toEqual([])
  })

  it("上限を超える合計byte数のrun assetを拒否する", async () => {
    const { db } = await createFixture()
    const internal = await createAgentInternalApi(db)
    const largeIds: string[] = []
    for (let index = 0; index < 3; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- libSQLはwriterが1つでfixture順序を意図している
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
    expect(
      await db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.clientMessageId, "too-many-bytes"))
    ).toEqual([])
  })
})

describe("Agent reusable assetの境界", () => {
  it.each(successfulCombinedImageScenarios)(
    "currentとreusableを組み合わせた画像$labelを受理する",
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
    "action mutation前にcurrentとreusableを組み合わせた画像$labelを拒否する",
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

  it("同じ会話の保持画像をすべて一覧する", async () => {
    const { db } = await createFixture()
    const internal = await createAgentInternalApi(db)
    const assetIds = await seedReusableConversationAssets(db, internal)

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
  })

  it("選択した過去画像だけをcurrent runへbindingする", async () => {
    const { db } = await createFixture()
    const internal = await createAgentInternalApi(db)
    const assetIds = await seedReusableConversationAssets(db, internal)
    await seedConversationTargetIssue(db)
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
  })

  it("rejected actionのlease解放後に過去画像を再利用する", async () => {
    const { db } = await createFixture()
    const internal = await createAgentInternalApi(db)
    const [assetId] = await seedReusableConversationAssets(db, internal, 1)
    if (!assetId) throw new Error("Reusable asset fixture is missing")
    await seedConversationTargetIssue(db)
    const run = (
      await startAssetChatRun(db, {
        assetIds: [],
        clientMessageId: "conversation-reject-message",
      })
    ).run
    const action = await internal.prepareUpdateIssue({
      grant: run.grant,
      idempotencyKey: "conversation-reject-key",
      issue: {
        operation: "add_attachments",
        attachmentAssetIds: [assetId],
        expectedRevision: 1,
        issueId: "conversation-target-issue",
      },
      toolCallId: "conversation-reject-call",
    })
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
          attachmentAssetIds: [assetId],
          expectedRevision: 1,
          issueId: "conversation-target-issue",
        },
        toolCallId: "conversation-reuse-after-reject-call",
      })
    ).resolves.toMatchObject({
      preview: {
        attachments: [expect.objectContaining({ assetId })],
      },
      status: "pending",
    })
  })
})
