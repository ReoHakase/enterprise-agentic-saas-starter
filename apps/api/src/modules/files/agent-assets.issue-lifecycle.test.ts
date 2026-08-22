import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { createAgentInternalApi, createAgentInternalApp } from "../agent/public"
import { processStorageObjectCleanupJobs } from "./agent-assets-cleanup"
import { promoteAgentAssetToIssueFileInTransaction } from "./agent-assets-repository"
import {
  assetRequest,
  createFixture,
  createRuntime,
  pngBytes,
  pngFile,
  seedReadyAsset,
  seedReadyIssueAttachment,
  startAssetChatRun,
  uploadRequest,
} from "./agent-assets.test-support"
import { AGENT_ASSET_MODEL_MAX_BYTES } from "./constants"
import { agentAssetDtoModel } from "./model"
import { configureFileStorageRuntime } from "./runtime"

describe("Agent asset Issue promotion and deletion", () => {
  it("releases attachment leases on Stop so the same staged asset can be prepared again", async () => {
    const { db } = await createFixture()
    const assetId = await seedReadyAsset(db, {
      id: "cancel-reusable-asset",
      sizeBytes: 16,
    })
    const now = new Date()
    const issueId = "cancel-reusable-issue"
    await db.insert(schema.issues).values({
      id: issueId,
      organizationId: "asset-org-a",
      number: 1,
      title: "Reusable attachment target",
      creatorId: "asset-user-a",
      createdAt: now,
      updatedAt: now,
    })
    const internal = await createAgentInternalApi(db)
    const firstRun = (
      await startAssetChatRun(db, {
        clientMessageId: "cancel-reusable-first",
        assetIds: [assetId],
      })
    ).run
    const firstAction = await internal.prepareUpdateIssue({
      grant: firstRun.grant,
      toolCallId: "tool-cancel-reusable-first",
      idempotencyKey: "prepare-cancel-reusable-first",
      issue: {
        operation: "add_attachments",
        issueId,
        expectedRevision: 1,
        attachmentAssetIds: [assetId],
      },
    })

    await internal.finalizeRun({
      grant: firstRun.grant,
      outcome: "canceled",
    })
    const [releasedLease] = await db
      .select({ releasedAt: schema.agentActionAssets.releasedAt })
      .from(schema.agentActionAssets)
      .where(eq(schema.agentActionAssets.actionId, firstAction.id))
    expect(releasedLease?.releasedAt).toBeInstanceOf(Date)

    const secondRun = (
      await startAssetChatRun(db, {
        clientMessageId: "cancel-reusable-second",
        assetIds: [assetId],
      })
    ).run
    await expect(
      internal.prepareUpdateIssue({
        grant: secondRun.grant,
        toolCallId: "tool-cancel-reusable-second",
        idempotencyKey: "prepare-cancel-reusable-second",
        issue: {
          operation: "add_attachments",
          issueId,
          expectedRevision: 1,
          attachmentAssetIds: [assetId],
        },
      })
    ).resolves.toMatchObject({
      kind: "update_issue",
      status: "pending",
    })
  })

  it("fails closed when an update action reaches succeeded without an exact attachment operation", async () => {
    const { db } = await createFixture()
    const run = (
      await startAssetChatRun(db, {
        clientMessageId: "malformed-update-operation",
      })
    ).run
    const now = new Date()
    const issueId = "malformed-update-issue"
    await db.insert(schema.issues).values({
      id: issueId,
      organizationId: "asset-org-a",
      number: 1,
      title: "Malformed update target",
      creatorId: "asset-user-a",
      createdAt: now,
      updatedAt: now,
    })
    const malformedPayloads = [
      {
        requestFingerprint: "missing-operation",
        issueId,
        expectedRevision: 1,
      },
      {
        operation: null,
        requestFingerprint: "null-operation",
        issueId,
        expectedRevision: 1,
      },
      {
        operation: "add_attachments",
        requestFingerprint: "missing-attachments",
        issueId,
        expectedRevision: 1,
      },
      {
        operation: "add_attachments",
        requestFingerprint: "null-attachments",
        issueId,
        expectedRevision: 1,
        attachments: null,
      },
    ]

    for (const [index, normalizedPayload] of malformedPayloads.entries()) {
      const actionId = `malformed-update-action-${index}`
      const storedPayload: typeof schema.agentActions.$inferInsert.normalizedPayload =
        normalizedPayload
      // oxlint-disable-next-line no-await-in-loop -- each malformed database transition is independently asserted.
      await db.insert(schema.agentActions).values({
        id: actionId,
        organizationId: "asset-org-a",
        threadId: "asset-thread-a",
        runId: run.runId,
        sessionId: "asset-session-a",
        userId: "asset-user-a",
        contextEpoch: 1,
        toolCallId: `malformed-update-tool-${index}`,
        kind: "update_issue",
        normalizedPayload: storedPayload,
        canonicalPreview: { title: "Malformed update" },
        targetType: "issue",
        targetId: issueId,
        targetRevision: 1,
        status: "pending",
        idempotencyKey: `malformed-update-idempotency-${index}`,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 10 * 60_000),
      })
      // oxlint-disable-next-line no-await-in-loop -- the real pending-to-approved transition precedes each malformed completion attempt.
      await db
        .update(schema.agentRuns)
        .set({ status: "waiting_approval" })
        .where(eq(schema.agentRuns.id, run.runId))
      // oxlint-disable-next-line no-await-in-loop -- the real pending-to-approved transition precedes each malformed completion attempt.
      await db
        .update(schema.agentActions)
        .set({
          status: "approved",
          decisionProvenance: "manual",
          decisionIdempotencyKey: `malformed-update-decision-${index}`,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.agentActions.id, actionId))
      // oxlint-disable-next-line no-await-in-loop -- each malformed database transition is independently asserted.
      await expect(
        db
          .update(schema.agentActions)
          .set({
            status: "succeeded",
            completedAt: now,
            receipt: {
              issueId,
              number: 1,
              revision: 1,
              deleted: false,
            },
          })
          .where(eq(schema.agentActions.id, actionId))
      ).rejects.toMatchObject({
        cause: {
          message: expect.stringMatching(
            /agent_action_(?:attachment_payload_mismatch|update_revision_mismatch)/
          ),
        },
      })
    }
  })
})

describe("Agent asset private image and file lifecycle", () => {
  it("revalidates Issue image ownership, transforms privately, and consumes idempotent vision quota", async () => {
    const { db, now } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    await db.insert(schema.issues).values([
      {
        id: "asset-issue-a",
        organizationId: "asset-org-a",
        number: 1,
        title: "Image marker",
        creatorId: "asset-user-a",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "asset-issue-a-other",
        organizationId: "asset-org-a",
        number: 2,
        title: "Other owner",
        creatorId: "asset-user-a",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "asset-issue-b",
        organizationId: "asset-org-b",
        number: 1,
        title: "Other tenant",
        creatorId: "asset-user-a",
        createdAt: now,
        updatedAt: now,
      },
    ])
    await seedReadyIssueAttachment(db, storage, {
      detectedImageFormat: "png",
      fileId: "asset-issue-image",
      issueId: "asset-issue-a",
    })
    await seedReadyIssueAttachment(db, storage, {
      detectedImageFormat: null,
      fileId: "asset-issue-pdf",
      issueId: "asset-issue-a",
    })
    await seedReadyIssueAttachment(db, storage, {
      detectedImageFormat: "png",
      fileId: "asset-other-tenant-image",
      issueId: "asset-issue-b",
      organizationId: "asset-org-b",
    })

    const internal = await createAgentInternalApi(db)
    const run = (
      await startAssetChatRun(db, { clientMessageId: "issue-image-run" })
    ).run
    const modelImage = await internal.getIssueAttachmentImageForModel({
      fileId: "asset-issue-image",
      grant: run.grant,
      issueId: "asset-issue-a",
    })
    expect(modelImage.status).toBe(200)
    expect(modelImage.headers.get("content-type")).toBe("image/webp")
    expect(modelImage.headers.get("cache-control")).toBe("private, no-store")
    expect(modelImage.headers.get("content-length")).toBe("6")
    expect(storage.images.transform).toHaveBeenLastCalledWith({
      fit: "scale-down",
      width: 2048,
    })
    expect(storage.images.output).toHaveBeenLastCalledWith({
      anim: false,
      format: "image/webp",
      quality: 75,
    })
    expect(storage.get).toHaveBeenLastCalledWith(
      "private/asset-org-a/files/asset-issue-image",
      {
        onlyIf: new Headers({ "if-match": '"agent-etag-1"' }),
      }
    )

    const internalApp = await createAgentInternalApp(db)
    const routeResponse = await internalApp.handle(
      new Request(
        "http://agent-internal.invalid/internal/agent/issues/asset-issue-a/attachments/asset-issue-image/model",
        { headers: { authorization: `Bearer ${run.grant}` } }
      )
    )
    expect(routeResponse.status).toBe(200)
    expect(routeResponse.headers.get("cache-control")).toBe("private, no-store")
    await routeResponse.body?.cancel()

    for (const candidate of [
      {
        issueId: "asset-issue-a-other",
        fileId: "asset-issue-image",
      },
      {
        issueId: "asset-issue-a",
        fileId: "asset-issue-pdf",
      },
      {
        issueId: "asset-issue-a",
        fileId: "asset-other-tenant-image",
      },
      {
        issueId: "asset-issue-a",
        fileId: "missing-file",
      },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- all hidden resource variants must expose the same 404 contract.
      await expect(
        internal.getIssueAttachmentImageForModel({
          ...candidate,
          grant: run.grant,
        })
      ).rejects.toMatchObject({ code: "not_found" })
    }

    const visionBuckets = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "vision_transform"))
    expect(visionBuckets).toEqual([{ count: 1 }, { count: 1 }])

    storage.setOutput({
      bytes: new Uint8Array(AGENT_ASSET_MODEL_MAX_BYTES + 1),
      contentLength: null,
    })
    await expect(
      internal.getIssueAttachmentImageForModel({
        fileId: "asset-issue-image",
        grant: run.grant,
        issueId: "asset-issue-a",
      })
    ).rejects.toMatchObject({ code: "validation_error" })
  })

  it("records a minimal file.uploaded audit inside zero-copy promotion", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const assetId = await seedReadyAsset(db, {
      id: "promotion-audit-asset",
      sizeBytes: 16,
    })
    const [object] = await db
      .select()
      .from(schema.storageObjects)
      .where(eq(schema.storageObjects.id, `storage-${assetId}`))
    if (!object?.etag || !object.objectKey) {
      throw new Error("Promotion storage fixture is incomplete")
    }
    storage.objects.set(object.objectKey, {
      bytes: Uint8Array.from(pngBytes()),
      object: {
        key: object.objectKey,
        size: object.sizeBytes,
        etag: object.etag,
        httpEtag: `"${object.etag}"`,
        customMetadata: {},
      },
    })
    await db.insert(schema.organizationFileUsage).values({
      organizationId: "asset-org-a",
      usedBytes: object.sizeBytes,
      temporaryBytes: object.sizeBytes,
      updatedAt: new Date(),
    })
    const run = (
      await startAssetChatRun(db, {
        clientMessageId: "promotion-audit-run",
        assetIds: [assetId],
      })
    ).run
    const now = new Date()
    const actionId = "promotion-audit-action"
    const issueId = "promotion-audit-issue"
    const plannedFileId = "promotion-audit-file"
    const leaseExpiresAt = new Date(now.getTime() + 5 * 60_000)
    await db.insert(schema.issues).values({
      id: issueId,
      organizationId: "asset-org-a",
      number: 1,
      title: "Issue from image",
      description: "Generated description",
      status: "open",
      priority: "no_priority",
      creatorId: "asset-user-a",
      labels: ["Visual"],
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(schema.agentActions).values({
      id: actionId,
      organizationId: "asset-org-a",
      threadId: "asset-thread-a",
      runId: run.runId,
      sessionId: "asset-session-a",
      userId: "asset-user-a",
      contextEpoch: 1,
      toolCallId: "promotion-audit-tool",
      kind: "update_issue",
      normalizedPayload: {
        operation: "add_attachments",
        requestFingerprint: "promotion-audit-fingerprint",
        issueId,
        expectedRevision: 1,
        attachments: [{ assetId, fileId: plannedFileId }],
      },
      canonicalPreview: { title: "Issue from image" },
      targetType: "issue",
      targetId: issueId,
      targetRevision: 1,
      status: "pending",
      idempotencyKey: "promotion-audit-idempotency",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })
    await db.insert(schema.agentActionAssets).values({
      organizationId: "asset-org-a",
      actionId,
      assetId,
      storageObjectId: object.id,
      sourceEtag: object.etag,
      sizeBytes: object.sizeBytes,
      leaseExpiresAt,
      createdAt: now,
    })
    const decidedAt = new Date(now.getTime() + 1)
    await db
      .update(schema.agentActions)
      .set({
        status: "approved",
        decisionProvenance: "manual",
        decisionIdempotencyKey: "promotion-audit-decision",
        decidedAt,
        updatedAt: decidedAt,
      })
      .where(eq(schema.agentActions.id, actionId))
    await db.transaction((tx) =>
      promoteAgentAssetToIssueFileInTransaction(tx, {
        actionId,
        actorUserId: "asset-user-a",
        assetId,
        issueId,
        now: new Date(decidedAt.getTime() + 1),
        organizationId: "asset-org-a",
        plannedFileId,
      })
    )
    const completedAt = new Date(decidedAt.getTime() + 2)
    await db
      .update(schema.issues)
      .set({
        description: "Generated description with attachment",
        updatedAt: completedAt,
      })
      .where(eq(schema.issues.id, issueId))
    await db
      .update(schema.agentActions)
      .set({
        status: "succeeded",
        resultId: issueId,
        receipt: {
          issueId,
          number: 1,
          revision: 2,
          deleted: false,
          attachmentMutation: {
            operation: "added",
            fileIds: [plannedFileId],
          },
        },
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(schema.agentActions.id, actionId))
    expect(
      await db
        .select({ status: schema.agentActions.status })
        .from(schema.agentActions)
        .where(eq(schema.agentActions.id, actionId))
    ).toEqual([{ status: "succeeded" }])

    expect(
      await db
        .select({
          action: schema.auditLogs.action,
          actorUserId: schema.auditLogs.actorUserId,
          metadata: schema.auditLogs.metadata,
          organizationId: schema.auditLogs.organizationId,
          targetId: schema.auditLogs.targetId,
          targetType: schema.auditLogs.targetType,
        })
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "file.uploaded"))
    ).toEqual([
      {
        action: "file.uploaded",
        actorUserId: "asset-user-a",
        metadata: {},
        organizationId: "asset-org-a",
        targetId: plannedFileId,
        targetType: "file",
      },
    ])
    expect(
      await db
        .select({
          objectKey: schema.files.objectKey,
          storageObjectId: schema.files.storageObjectId,
        })
        .from(schema.files)
        .where(eq(schema.files.id, plannedFileId))
    ).toEqual([{ objectKey: object.objectKey, storageObjectId: object.id }])

    const promotedPreview = await app.handle(assetRequest({ assetId }))
    expect(promotedPreview.status).toBe(200)
    expect(promotedPreview.headers.get("content-type")).toBe("image/webp")

    const unauthorizedPreview = await app.handle(
      assetRequest({
        assetId,
        sessionId: "asset-session-b",
        userId: "asset-user-b",
      })
    )
    expect(unauthorizedPreview.status).toBe(404)
  })

  it("blocks deletion under an active action lease, then releases quota and exact-deletes", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "leased-asset" })
    )
    expect(uploaded.status).toBe(201)
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
    const [object] = await db.select().from(schema.storageObjects)
    expect(object?.objectKey).toBeTruthy()

    const run = (
      await startAssetChatRun(db, {
        clientMessageId: "lease-run",
        assetIds: [assetId],
      })
    ).run
    const actionCreatedAt = new Date()
    const actionExpiresAt = new Date(actionCreatedAt.getTime() + 10 * 60_000)
    await db.insert(schema.agentActions).values({
      id: "leased-action",
      organizationId: "asset-org-a",
      threadId: "asset-thread-a",
      runId: run.runId,
      sessionId: "asset-session-a",
      userId: "asset-user-a",
      contextEpoch: 1,
      toolCallId: "leased-tool-call",
      kind: "create_issue",
      normalizedPayload: { title: "Issue with attachment" },
      canonicalPreview: { title: "Issue with attachment" },
      targetType: "issue",
      targetId: "planned-leased-issue",
      status: "pending",
      idempotencyKey: "leased-action-key",
      createdAt: actionCreatedAt,
      updatedAt: actionCreatedAt,
      expiresAt: actionExpiresAt,
    })
    await db.insert(schema.agentActionAssets).values({
      organizationId: "asset-org-a",
      actionId: "leased-action",
      assetId,
      storageObjectId: object?.id,
      sourceEtag: object?.etag ?? "",
      sizeBytes: object?.sizeBytes ?? -1,
      leaseExpiresAt: new Date(actionCreatedAt.getTime() + 5 * 60_000),
      createdAt: actionCreatedAt,
    })

    const blocked = await app.handle(
      assetRequest({ assetId, method: "DELETE" })
    )
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toMatchObject({ error: "conflict" })
    expect(await db.select().from(schema.storageObjectCleanupJobs)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 16, usedBytes: 16 }),
    ])

    const completedAt = new Date()
    await db
      .update(schema.agentActions)
      .set({
        status: "canceled",
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(schema.agentActions.id, "leased-action"))
    const removed = await app.handle(
      assetRequest({ assetId, method: "DELETE" })
    )
    expect(removed.status).toBe(204)
    expect(storage.deletedKeys).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 0, usedBytes: 0 }),
    ])
    expect(await db.select().from(schema.storageObjectClaims)).toEqual([])
    expect(await db.select().from(schema.agentAssets)).toEqual([
      expect.objectContaining({ status: "deleted", storageObjectId: null }),
    ])

    const cleanup = await processStorageObjectCleanupJobs({
      bucket: storage.bucket,
      database: db,
      now: new Date(completedAt.getTime() + 1_000),
    })
    expect(cleanup).toMatchObject({ claimed: 1, completed: 1, failed: 0 })
    expect(storage.deletedKeys).toEqual([object?.objectKey])
    expect(await db.select().from(schema.storageObjects)).toEqual([
      expect.objectContaining({ objectKey: null, status: "deleted" }),
    ])
    expect(await db.select().from(schema.storageObjectCleanupJobs)).toEqual([
      expect.objectContaining({ status: "completed" }),
    ])
  })
})
