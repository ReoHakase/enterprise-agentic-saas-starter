import * as schema from "@enterprise-agentic-saas/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { HttpError } from "../../errors/http-error"
import { agentAssetObjectKey } from "../files/public"
import { updateIssueById } from "../issues/public"
import { findEffectiveIssueThumbnail } from "../issues/repository-support"
import { createFixture } from "./action-repository.test-support"
import { putAgentApprovalPolicyForSession } from "./actions/repository"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

type FixtureDb = Awaited<ReturnType<typeof createFixture>>["db"]

const seedReadyAsset = async (
  db: FixtureDb,
  input: {
    assetId: string
    organizationId?: string
    sessionId?: string | null
    storageObjectId: string
    threadId: string
  }
) => {
  const now = new Date()
  const organizationId = input.organizationId ?? "action-org-a"
  const objectKey = agentAssetObjectKey({
    organizationId,
    storageObjectId: input.storageObjectId,
  })
  await db
    .insert(schema.organizationFileUsage)
    .values({
      organizationId,
      usedBytes: 64,
      temporaryBytes: 64,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.organizationFileUsage.organizationId,
      set: {
        usedBytes: sql`${schema.organizationFileUsage.usedBytes} + 64`,
        temporaryBytes: sql`${schema.organizationFileUsage.temporaryBytes} + 64`,
        updatedAt: now,
      },
    })
  await db.insert(schema.storageObjects).values({
    id: input.storageObjectId,
    organizationId,
    uploaderId: "action-user-a",
    uploadId: `upload-${input.assetId}`,
    objectKey,
    sizeBytes: 64,
    declaredContentType: "image/png",
    detectedImageFormat: "png",
    imageWidth: 8,
    imageHeight: 8,
    status: "pending",
    keyVersion: 2,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(schema.agentAssets).values({
    id: input.assetId,
    organizationId,
    threadId: input.threadId,
    sessionId:
      input.sessionId === undefined ? "action-session-a" : input.sessionId,
    contextEpoch: 1,
    uploaderId: "action-user-a",
    storageObjectId: input.storageObjectId,
    filename: `${input.assetId}.png`,
    status: "pending",
    expiresAt: new Date(now.getTime() + 3_600_000),
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(schema.storageObjectClaims).values({
    storageObjectId: input.storageObjectId,
    organizationId,
    holderType: "agent_asset",
    holderId: input.assetId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  await db
    .update(schema.storageObjects)
    .set({ etag: `etag-${input.assetId}`, status: "ready", updatedAt: now })
    .where(eq(schema.storageObjects.id, input.storageObjectId))
  await db
    .update(schema.agentAssets)
    .set({ status: "ready", updatedAt: now })
    .where(eq(schema.agentAssets.id, input.assetId))
}

const createAttachmentRun = async (
  db: FixtureDb,
  assetIds: readonly string[]
) => {
  const thread = await createAgentThreadForSession(db, {
    sessionId: "action-session-a",
    userId: "action-user-a",
    title: "Attachment update",
  })
  for (const [index, assetId] of assetIds.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- fixture rows preserve deterministic claim order.
    await seedReadyAsset(db, {
      assetId,
      storageObjectId: `storage-${index}-${assetId}`,
      threadId: thread.id,
    })
  }
  const ticket = await issueAgentConnectionTicket(db, {
    sessionId: "action-session-a",
    userId: "action-user-a",
    threadId: thread.id,
  })
  const internal = createAgentInternalApi(db)
  const connection = await internal.consumeConnectionTicket({
    ticket: ticket.ticket,
    threadId: thread.id,
  })
  const run = await internal.startRun({
    grant: connection.grant,
    clientMessageId: `attachments-${assetIds.join("-")}`,
    assetIds: [...assetIds],
  })
  await putAgentApprovalPolicyForSession(db, {
    sessionId: "action-session-a",
    userId: "action-user-a",
    threadId: thread.id,
    mode: "full_access",
  })
  return { internal, run, thread }
}

describe("Agent Issue attachment action transactions", () => {
  it("adds and removes an attachment with one receipt, revision, owner, claim, usage, audit, and thumbnail lifecycle", async () => {
    const { db } = await createFixture()
    const assetId = "attachment-asset-success"
    const { internal, run } = await createAttachmentRun(db, [assetId])
    const addedAction = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-add-attachment",
      idempotencyKey: "prepare-add-attachment",
      issue: {
        operation: "add_attachments",
        issueId: "action-issue-a",
        expectedRevision: 1,
        attachmentAssetIds: [assetId],
      },
    })
    const added = await internal.executeApprovedAction({
      grant: run.grant,
      actionId: addedAction.id,
    })
    expect(added.issue).toMatchObject({
      revision: 2,
      attachmentMutation: { operation: "added" },
    })
    await expect(
      internal.executeApprovedAction({
        grant: run.grant,
        actionId: addedAction.id,
      })
    ).resolves.toEqual(added)
    const fileId = added.issue.attachmentMutation?.fileIds[0]
    expect(fileId).toBeTypeOf("string")
    const [owner] = await db
      .select()
      .from(schema.issueFileOwners)
      .where(eq(schema.issueFileOwners.fileId, fileId ?? ""))
    expect(owner).toMatchObject({
      issueId: "action-issue-a",
      organizationId: "action-org-a",
    })
    const [claim] = await db
      .select()
      .from(schema.storageObjectClaims)
      .where(eq(schema.storageObjectClaims.holderId, fileId ?? ""))
    expect(claim).toMatchObject({ holderType: "file", revision: 3 })
    const [usageAfterAdd] = await db
      .select()
      .from(schema.organizationFileUsage)
      .where(eq(schema.organizationFileUsage.organizationId, "action-org-a"))
    expect(usageAfterAdd).toMatchObject({ usedBytes: 64, temporaryBytes: 0 })
    expect(
      await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.targetId, "action-issue-a"),
            eq(schema.auditLogs.action, "issue.updated")
          )
        )
    ).toHaveLength(1)
    await expect(
      findEffectiveIssueThumbnail(db, {
        issueId: "action-issue-a",
        organizationId: "action-org-a",
      })
    ).resolves.toMatchObject({
      mode: "automatic",
      file: { id: fileId },
    })

    const removedAction = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-remove-attachment",
      idempotencyKey: "prepare-remove-attachment",
      issue: {
        operation: "remove_attachments",
        issueId: "action-issue-a",
        expectedRevision: 2,
        attachmentFileIds: [fileId ?? ""],
      },
    })
    const removed = await internal.executeApprovedAction({
      grant: run.grant,
      actionId: removedAction.id,
    })
    expect(removed.issue).toEqual({
      id: "action-issue-a",
      number: 1,
      revision: 3,
      deleted: false,
      attachmentMutation: { operation: "removed", fileIds: [fileId] },
    })
    expect(
      await db
        .select()
        .from(schema.files)
        .where(eq(schema.files.id, fileId ?? ""))
    ).toEqual([])
    expect(
      await findEffectiveIssueThumbnail(db, {
        issueId: "action-issue-a",
        organizationId: "action-org-a",
      })
    ).toEqual({ mode: "automatic", file: null })
    const [usageAfterRemove] = await db
      .select()
      .from(schema.organizationFileUsage)
      .where(eq(schema.organizationFileUsage.organizationId, "action-org-a"))
    expect(usageAfterRemove).toMatchObject({ usedBytes: 0, temporaryBytes: 0 })
    const audits = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.targetId, "action-issue-a"),
          eq(schema.auditLogs.action, "issue.updated")
        )
      )
    expect(audits).toHaveLength(2)
  })

  it("rejects stale revision and a file owned by another Issue without mutation", async () => {
    const { db } = await createFixture()
    const assetId = "attachment-asset-stale"
    const { internal, run } = await createAttachmentRun(db, [assetId])
    const prepared = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-stale-attachment",
      idempotencyKey: "prepare-stale-attachment",
      issue: {
        operation: "add_attachments",
        issueId: "action-issue-a",
        expectedRevision: 1,
        attachmentAssetIds: [assetId],
      },
    })
    await updateIssueById(db, {
      id: "action-issue-a",
      actorUserId: "action-user-a",
      organizationId: "action-org-a",
      title: "Human revision",
    })
    await expect(
      internal.executeApprovedAction({
        grant: run.grant,
        actionId: prepared.id,
      })
    ).rejects.toMatchObject({
      code: "conflict",
    })
    expect(
      await db
        .select()
        .from(schema.files)
        .where(eq(schema.files.organizationId, "action-org-a"))
    ).toEqual([])

    await db.insert(schema.issues).values({
      id: "action-issue-second",
      organizationId: "action-org-a",
      number: 2,
      title: "Second Issue",
      creatorId: "action-user-a",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const crossIssueFileId = "file-from-first-issue"
    await db.insert(schema.files).values({
      id: crossIssueFileId,
      organizationId: "action-org-a",
      uploaderId: "action-user-a",
      uploadId: "cross-issue-upload",
      ownerType: "issue",
      objectKey: "private/cross-issue-file",
      filename: "cross-issue.png",
      sizeBytes: 1,
      declaredContentType: "image/png",
      detectedImageFormat: "png",
      imageWidth: 1,
      imageHeight: 1,
      etag: "cross-issue-etag",
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(schema.issueFileOwners).values({
      fileId: crossIssueFileId,
      organizationId: "action-org-a",
      ownerType: "issue",
      issueId: "action-issue-a",
    })
    await expect(
      internal.prepareUpdateIssue({
        grant: run.grant,
        toolCallId: "tool-cross-issue-remove",
        idempotencyKey: "prepare-cross-issue-remove",
        issue: {
          operation: "remove_attachments",
          issueId: "action-issue-second",
          expectedRevision: 1,
          attachmentFileIds: [crossIssueFileId],
        },
      })
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("does not disclose or attach another tenant's staged asset", async () => {
    const { db } = await createFixture()
    const otherThreadId = "action-org-b-asset-thread"
    await db.insert(schema.agentThreads).values({
      id: otherThreadId,
      organizationId: "action-org-b",
      ownerUserId: "action-user-a",
      status: "active",
      createdAt: new Date(),
    })
    const otherAssetId = "attachment-asset-other-tenant"
    await seedReadyAsset(db, {
      assetId: otherAssetId,
      organizationId: "action-org-b",
      sessionId: null,
      storageObjectId: "storage-other-tenant",
      threadId: otherThreadId,
    })
    const { internal, run } = await createAttachmentRun(db, [])

    await expect(
      internal.prepareUpdateIssue({
        grant: run.grant,
        toolCallId: "tool-cross-tenant-attachment",
        idempotencyKey: "prepare-cross-tenant-attachment",
        issue: {
          operation: "add_attachments",
          issueId: "action-issue-a",
          expectedRevision: 1,
          attachmentAssetIds: [otherAssetId],
        },
      })
    ).rejects.toMatchObject({
      code: "not_found",
    })
    const [issue] = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issue?.revision).toBe(1)
    expect(
      await db
        .select()
        .from(schema.files)
        .where(eq(schema.files.organizationId, "action-org-a"))
    ).toEqual([])
    expect(
      await db
        .select()
        .from(schema.agentActions)
        .where(eq(schema.agentActions.organizationId, "action-org-a"))
    ).toEqual([])
  })

  it("rolls back the first promotion when the second file insert fails", async () => {
    const { db } = await createFixture()
    const assetIds = ["attachment-asset-first", "attachment-asset-second"]
    const { internal, run } = await createAttachmentRun(db, assetIds)
    const prepared = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-add-two-attachments",
      idempotencyKey: "prepare-add-two-attachments",
      issue: {
        operation: "add_attachments",
        issueId: "action-issue-a",
        expectedRevision: 1,
        attachmentAssetIds: assetIds,
      },
    })
    const [storedAction] = await db
      .select({ payload: schema.agentActions.normalizedPayload })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, prepared.id))
    const payload = structuredClone(storedAction?.payload)
    if (
      !payload ||
      typeof payload !== "object" ||
      !("attachments" in payload) ||
      !Array.isArray(payload.attachments)
    ) {
      throw new Error("Expected normalized attachment payload")
    }
    const collidingAttachment = payload.attachments.at(1)
    if (
      !collidingAttachment ||
      typeof collidingAttachment !== "object" ||
      !("fileId" in collidingAttachment) ||
      typeof collidingAttachment.fileId !== "string"
    ) {
      throw new Error("Expected second planned attachment file")
    }
    const collidingFileId = collidingAttachment.fileId
    await db.insert(schema.files).values({
      id: collidingFileId,
      organizationId: "action-org-b",
      uploaderId: "action-user-a",
      uploadId: "collision-upload",
      ownerType: "issue",
      objectKey: "private/collision-file",
      filename: "collision.png",
      sizeBytes: 1,
      declaredContentType: "image/png",
      etag: "collision-etag",
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const executionError = await internal
      .executeApprovedAction({
        grant: run.grant,
        actionId: prepared.id,
      })
      .then(
        () => undefined,
        (cause: unknown) => cause
      )
    expect(executionError).toBeInstanceOf(Error)
    expect(executionError).not.toBeInstanceOf(HttpError)
    const [issue] = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issue?.revision).toBe(1)
    expect(
      await db
        .select()
        .from(schema.files)
        .where(eq(schema.files.organizationId, "action-org-a"))
    ).toEqual([])
    const assets = await db
      .select({ status: schema.agentAssets.status })
      .from(schema.agentAssets)
      .where(eq(schema.agentAssets.organizationId, "action-org-a"))
    expect(assets).toEqual([{ status: "ready" }, { status: "ready" }])
  })

  it("forces attachment add and remove selected after Web search to manual approval", async () => {
    const addFixture = await createFixture()
    const addAssetId = "attachment-asset-search-taint-add"
    const addRun = await createAttachmentRun(addFixture.db, [addAssetId])
    await addRun.internal.reserveWebSearch({
      grant: addRun.run.grant,
      operationId: "search-before-attachment-add",
    })
    await expect(
      addRun.internal.prepareUpdateIssue({
        grant: addRun.run.grant,
        toolCallId: "tool-add-after-web-search",
        idempotencyKey: "prepare-add-after-web-search",
        issue: {
          operation: "add_attachments",
          issueId: "action-issue-a",
          expectedRevision: 1,
          attachmentAssetIds: [addAssetId],
        },
      })
    ).resolves.toMatchObject({
      approvalMode: null,
      requiresApproval: true,
      status: "pending",
    })
    expect(await addFixture.db.select().from(schema.files)).toEqual([])
    expect(await addFixture.db.select().from(schema.auditLogs)).toEqual([])

    const removeFixture = await createFixture()
    const removeAssetId = "attachment-asset-search-taint-remove"
    const removeRun = await createAttachmentRun(removeFixture.db, [
      removeAssetId,
    ])
    const addedAction = await removeRun.internal.prepareUpdateIssue({
      grant: removeRun.run.grant,
      toolCallId: "tool-seed-attachment-before-web-search",
      idempotencyKey: "prepare-seed-attachment-before-web-search",
      issue: {
        operation: "add_attachments",
        issueId: "action-issue-a",
        expectedRevision: 1,
        attachmentAssetIds: [removeAssetId],
      },
    })
    const added = await removeRun.internal.executeApprovedAction({
      grant: removeRun.run.grant,
      actionId: addedAction.id,
    })
    const fileId = added.issue.attachmentMutation?.fileIds[0]
    if (!fileId) throw new Error("Expected seeded attachment file")
    const auditsBeforeSearch = await removeFixture.db
      .select()
      .from(schema.auditLogs)
    await removeRun.internal.reserveWebSearch({
      grant: removeRun.run.grant,
      operationId: "search-before-attachment-remove",
    })
    await expect(
      removeRun.internal.prepareUpdateIssue({
        grant: removeRun.run.grant,
        toolCallId: "tool-remove-after-web-search",
        idempotencyKey: "prepare-remove-after-web-search",
        issue: {
          operation: "remove_attachments",
          issueId: "action-issue-a",
          expectedRevision: 2,
          attachmentFileIds: [fileId],
        },
      })
    ).resolves.toMatchObject({
      approvalMode: null,
      requiresApproval: true,
      status: "pending",
    })
    expect(
      await removeFixture.db
        .select({ id: schema.files.id })
        .from(schema.files)
        .where(eq(schema.files.id, fileId))
    ).toEqual([{ id: fileId }])
    expect(await removeFixture.db.select().from(schema.auditLogs)).toEqual(
      auditsBeforeSearch
    )
  })
})
