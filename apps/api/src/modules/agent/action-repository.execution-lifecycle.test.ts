import * as schema from "@enterprise-agentic-saas/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { HttpError } from "../../errors/http-error"
import {
  agentAssetObjectKey,
  findPreviewableAgentAssetForSession,
} from "../files/public"
import {
  createFixture,
  createRun,
  request,
} from "./action-repository.test-support"
import {
  issueAgentActionResumeTicket,
  prepareCreateIssueAction,
  putAgentApprovalPolicyForSession,
  resumeAgentApprovedAction,
} from "./actions/repository"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

const createRunBoundImageFixture = async () => {
  const { db } = await createFixture()
  const now = new Date()
  const thread = await createAgentThreadForSession(db, {
    sessionId: "action-session-a",
    userId: "action-user-a",
    title: "Attachment action",
    now,
  })
  const ticket = await issueAgentConnectionTicket(db, {
    sessionId: "action-session-a",
    userId: "action-user-a",
    threadId: thread.id,
    now,
  })
  const storageObjectId = "action-storage-image"
  const assetId = "action-asset-image"
  const objectKey = agentAssetObjectKey({
    organizationId: "action-org-a",
    storageObjectId,
  })
  await db.insert(schema.organizationFileUsage).values({
    organizationId: "action-org-a",
    usedBytes: 128,
    temporaryBytes: 128,
    updatedAt: now,
  })
  await db.insert(schema.storageObjects).values({
    id: storageObjectId,
    organizationId: "action-org-a",
    uploaderId: "action-user-a",
    uploadId: "action-upload-image",
    objectKey,
    sizeBytes: 128,
    declaredContentType: "image/png",
    detectedImageFormat: "png",
    imageWidth: 16,
    imageHeight: 16,
    status: "pending",
    keyVersion: 2,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(schema.agentAssets).values({
    id: assetId,
    organizationId: "action-org-a",
    threadId: thread.id,
    sessionId: "action-session-a",
    contextEpoch: 1,
    uploaderId: "action-user-a",
    storageObjectId,
    filename: "screenshot.png",
    status: "pending",
    expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(schema.storageObjectClaims).values({
    storageObjectId,
    organizationId: "action-org-a",
    holderType: "agent_asset",
    holderId: assetId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  await db
    .update(schema.storageObjects)
    .set({ etag: "action-image-etag", status: "ready", updatedAt: now })
    .where(eq(schema.storageObjects.id, storageObjectId))
  await db
    .update(schema.agentAssets)
    .set({ status: "ready", updatedAt: now })
    .where(eq(schema.agentAssets.id, assetId))

  const internal = createAgentInternalApi(db)
  const { run } = await internal.startChatRun({
    clientMessageId: "attachment-create",
    assetIds: [assetId],
    ticket: ticket.ticket,
    threadId: thread.id,
  })
  await putAgentApprovalPolicyForSession(db, {
    sessionId: "action-session-a",
    userId: "action-user-a",
    threadId: thread.id,
    mode: "full_access",
  })
  return {
    assetId,
    db,
    internal,
    now,
    objectKey,
    run,
    storageObjectId,
    thread,
  }
}

type RunBoundImageFixture = Awaited<
  ReturnType<typeof createRunBoundImageFixture>
>

const prepareRunBoundImageIssue = (fixture: RunBoundImageFixture) =>
  fixture.internal.prepareCreateIssue({
    grant: fixture.run.grant,
    toolCallId: "tool-create-with-image",
    idempotencyKey: "prepare-create-with-image",
    issue: {
      title: "Issue from screenshot",
      description: "Generated image description",
      labels: ["Visual"],
      attachmentAssetIds: [fixture.assetId],
    },
  })

const promoteRunBoundImage = async (fixture: RunBoundImageFixture) => {
  const action = await prepareRunBoundImageIssue(fixture)
  const created = await fixture.internal.executeApprovedAction({
    grant: fixture.run.grant,
    actionId: action.id,
  })
  return { action, created }
}

describe("Agent Issue actionの実行lifecycle", () => {
  it("run-bound画像をbyte複製せずIssue fileへ昇格する", async () => {
    const fixture = await createRunBoundImageFixture()
    const { action } = await promoteRunBoundImage(fixture)

    expect(action.preview?.attachments).toEqual([
      {
        source: "asset",
        assetId: fixture.assetId,
        filename: "screenshot.png",
        sizeBytes: 128,
      },
    ])
    const [file] = await fixture.db
      .select()
      .from(schema.files)
      .where(eq(schema.files.storageObjectId, fixture.storageObjectId))
    expect(file).toMatchObject({
      filename: "screenshot.png",
      objectKey: fixture.objectKey,
      status: "ready",
    })
    const [promotedAsset] = await fixture.db
      .select()
      .from(schema.agentAssets)
      .where(eq(schema.agentAssets.id, fixture.assetId))
    expect(promotedAsset).toMatchObject({
      promotedFileId: file?.id,
      status: "promoted",
      storageObjectId: null,
    })
    const [promotedClaim] = await fixture.db
      .select()
      .from(schema.storageObjectClaims)
      .where(
        eq(schema.storageObjectClaims.storageObjectId, fixture.storageObjectId)
      )
    expect(promotedClaim).toMatchObject({
      holderId: file?.id,
      holderType: "file",
      revision: 3,
    })
    const [promotedUsage] = await fixture.db
      .select()
      .from(schema.organizationFileUsage)
      .where(eq(schema.organizationFileUsage.organizationId, "action-org-a"))
    expect(promotedUsage).toMatchObject({ usedBytes: 128, temporaryBytes: 0 })
  })

  it("lease済みassetを2つ目のIssue actionへ予約しない", async () => {
    const fixture = await createRunBoundImageFixture()
    await prepareRunBoundImageIssue(fixture)

    await expect(
      fixture.internal.prepareCreateIssue({
        grant: fixture.run.grant,
        toolCallId: "tool-create-with-leased-image",
        idempotencyKey: "prepare-create-with-leased-image",
        issue: {
          title: "Second issue from screenshot",
          attachmentAssetIds: [fixture.assetId],
        },
      })
    ).rejects.toMatchObject({
      code: "conflict",
    })
  })

  it("昇格済みassetを別sessionへ公開しない", async () => {
    const fixture = await createRunBoundImageFixture()
    await promoteRunBoundImage(fixture)

    const promotedPreview = await findPreviewableAgentAssetForSession(
      fixture.db,
      {
        assetId: fixture.assetId,
        organizationId: "action-org-a",
        sessionId: "action-session-a",
        userId: "action-user-a",
        now: fixture.now,
      }
    )
    expect(promotedPreview).toMatchObject({
      asset: { id: fixture.assetId, status: "promoted" },
      storage: { id: fixture.storageObjectId, status: "ready" },
      claim: { holderType: "file" },
    })
    await expect(
      findPreviewableAgentAssetForSession(fixture.db, {
        assetId: fixture.assetId,
        organizationId: "action-org-a",
        sessionId: "action-session-b",
        userId: "action-user-b",
        now: fixture.now,
      })
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("Issue削除時にv2 storageとquotaを解放してcleanupをqueueへ積む", async () => {
    const fixture = await createRunBoundImageFixture()
    const { created } = await promoteRunBoundImage(fixture)
    await putAgentApprovalPolicyForSession(fixture.db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: fixture.thread.id,
      mode: "full_access",
    })
    const deleteAction = await fixture.internal.prepareDeleteIssue({
      grant: fixture.run.grant,
      toolCallId: "tool-delete-with-image",
      idempotencyKey: "prepare-delete-with-image",
      issue: { issueId: created.issue.id, expectedRevision: 1 },
    })
    await fixture.internal.executeApprovedAction({
      grant: fixture.run.grant,
      actionId: deleteAction.id,
    })
    expect(
      await fixture.db
        .select()
        .from(schema.storageObjectClaims)
        .where(
          eq(
            schema.storageObjectClaims.storageObjectId,
            fixture.storageObjectId
          )
        )
    ).toEqual([])
    const [releasedStorage] = await fixture.db
      .select()
      .from(schema.storageObjects)
      .where(eq(schema.storageObjects.id, fixture.storageObjectId))
    expect(releasedStorage).toMatchObject({
      cleanupRevision: 1,
      objectKey: fixture.objectKey,
      status: "deleting",
    })
    expect(
      await fixture.db
        .select()
        .from(schema.storageObjectCleanupJobs)
        .where(
          eq(
            schema.storageObjectCleanupJobs.storageObjectId,
            fixture.storageObjectId
          )
        )
    ).toHaveLength(1)
    const [releasedUsage] = await fixture.db
      .select()
      .from(schema.organizationFileUsage)
      .where(eq(schema.organizationFileUsage.organizationId, "action-org-a"))
    expect(releasedUsage).toMatchObject({ usedBytes: 0, temporaryBytes: 0 })
  })

  it("冪等なprepareを1回数えてroot write上限を適用する", async () => {
    const { db } = await createFixture()
    const actionRun = await createRun(db, { clientMessageId: "write-limit" })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: actionRun.thread.id,
      mode: "full_access",
    })
    const prepared = []
    for (let index = 0; index < 5; index += 1) {
      prepared.push(
        // oxlint-disable-next-line no-await-in-loop -- root counterの順序と境界を検証する
        await actionRun.internal.prepareCreateIssue({
          grant: actionRun.run.grant,
          toolCallId: `tool-write-limit-${index}`,
          idempotencyKey: `prepare-write-limit-${index}`,
          issue: { title: `Limited issue ${index}` },
        })
      )
    }
    const repeated = await actionRun.internal.prepareCreateIssue({
      grant: actionRun.run.grant,
      toolCallId: "tool-write-limit-0",
      idempotencyKey: "prepare-write-limit-0",
      issue: { title: "Limited issue 0" },
    })
    expect(repeated.id).toBe(prepared[0]?.id)
    await expect(
      actionRun.internal.prepareCreateIssue({
        grant: actionRun.run.grant,
        toolCallId: "tool-write-limit-overflow",
        idempotencyKey: "prepare-write-limit-overflow",
        issue: { title: "Overflow issue" },
      })
    ).rejects.toMatchObject({
      code: "conflict",
    })
    const [root] = await db
      .select({ writeCount: schema.agentRuns.writeCount })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, actionRun.run.rootRunId))
    expect(root?.writeCount).toBe(5)
  })

  it("一時的なexecute失敗をrollbackして同じactionを正確に1回再試行する", async () => {
    const { client, db } = await createFixture()
    const { internal, run, thread } = await createRun(db, {
      clientMessageId: "transient-create",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
    })
    const prepared = await prepareCreateIssueAction(db, {
      grant: run.grant,
      toolCallId: "tool-transient-create",
      idempotencyKey: "prepare-transient-create",
      issue: { title: "Retry-safe issue" },
    })
    expect(prepared.status).toBe("approved")

    await client.execute(`
      create trigger fail_agent_action_once
      before update of status on agent_actions
      for each row when new.status = 'succeeded'
      begin
        select raise(abort, 'transient_agent_action_failure');
      end
    `)
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
    const failedAction = await db
      .select({
        attempt: schema.agentActions.attempt,
        status: schema.agentActions.status,
      })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, prepared.id))
    expect(failedAction).toEqual([{ attempt: 0, status: "approved" }])
    expect(
      await db
        .select({ id: schema.issues.id })
        .from(schema.issues)
        .where(eq(schema.issues.title, "Retry-safe issue"))
    ).toEqual([])

    await client.execute("drop trigger fail_agent_action_once")
    const result = await internal.executeApprovedAction({
      grant: run.grant,
      actionId: prepared.id,
    })
    expect(result).toMatchObject({
      status: "succeeded",
      issue: { revision: 1, deleted: false },
    })
    expect(
      await db
        .select({ id: schema.issues.id })
        .from(schema.issues)
        .where(eq(schema.issues.title, "Retry-safe issue"))
    ).toHaveLength(1)
  })

  it("organization切替時にapproved actionとpolicyとresume ticketとleaseを失効させる", async () => {
    const { app, db } = await createFixture()
    const { internal, run, thread } = await createRun(db, {
      clientMessageId: "switch-action",
    })
    const unusedTicket = await issueAgentConnectionTicket(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
    })
    const [contextBefore] = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "action-session-a"))
    const prepared = await internal.prepareDeleteIssue({
      grant: run.grant,
      toolCallId: "tool-switch-action",
      idempotencyKey: "prepare-switch-action",
      issue: { issueId: "action-issue-a", expectedRevision: 1 },
    })
    await app.handle(
      request(`/agent/actions/${prepared.id}/decision`, {
        method: "POST",
        body: {
          decision: "yes",
          idempotencyKey: "decision-switch-action",
        },
      })
    )
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
    })
    const resume = await issueAgentActionResumeTicket(db, {
      actionId: prepared.id,
      sessionId: "action-session-a",
      userId: "action-user-a",
    })

    const switched = await app.handle(
      request("/organizations/action-org-b/activate", {
        method: "POST",
        body: {},
      })
    )
    expect(switched.status).toBe(200)
    const [contextAfter] = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "action-session-a"))
    expect(contextAfter?.contextEpoch).toBe(
      (contextBefore?.contextEpoch ?? 0) + 1
    )
    const [unconsumedTicket] = await db
      .select({ revokedAt: schema.agentConnectionTickets.revokedAt })
      .from(schema.agentConnectionTickets)
      .where(
        and(
          eq(schema.agentConnectionTickets.sessionId, "action-session-a"),
          isNull(schema.agentConnectionTickets.consumedAt)
        )
      )
    expect(unconsumedTicket?.revokedAt).toBeInstanceOf(Date)
    const grants = await db
      .select({ revokedAt: schema.agentGrants.revokedAt })
      .from(schema.agentGrants)
      .where(eq(schema.agentGrants.sessionId, "action-session-a"))
    expect(grants).toHaveLength(1)
    expect(grants.every((grant) => grant.revokedAt instanceof Date)).toBe(true)
    const [storedRun] = await db
      .select({ status: schema.agentRuns.status })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, run.runId))
    expect(storedRun).toEqual({ status: "canceled" })
    const [action] = await db
      .select({ status: schema.agentActions.status })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, prepared.id))
    expect(action).toEqual({ status: "canceled" })
    const policies = await db
      .select({ id: schema.agentApprovalPolicies.id })
      .from(schema.agentApprovalPolicies)
      .where(eq(schema.agentApprovalPolicies.threadId, thread.id))
      .orderBy(schema.agentApprovalPolicies.createdAt)
    expect(policies).toEqual([])
    const [ticket] = await db
      .select({ revokedAt: schema.agentResumeTickets.revokedAt })
      .from(schema.agentResumeTickets)
      .where(eq(schema.agentResumeTickets.actionId, prepared.id))
    expect(ticket?.revokedAt).toBeInstanceOf(Date)
    await expect(
      internal.startChatRun({
        clientMessageId: "switch-replay",
        ticket: unusedTicket.ticket,
        threadId: thread.id,
      })
    ).rejects.toMatchObject({ code: "unauthorized" })
    await expect(
      internal.readActiveOrganization({ grant: run.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
    await expect(
      resumeAgentApprovedAction(db, {
        actionId: prepared.id,
        resumeTicket: resume.ticket,
      })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })
})
