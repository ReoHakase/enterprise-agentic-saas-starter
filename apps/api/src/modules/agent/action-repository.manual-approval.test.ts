import * as schema from "@enterprise-agentic-saas/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { updateIssueById } from "../issues/public"
import {
  createFixture,
  createRun,
  request,
} from "./action-repository.test-support"
import { issueAgentActionResumeTicket } from "./actions/repository"
import { issueAgentConnectionTicket } from "./threads/repository"

const manualUpdateIssue = () => ({
  issueId: "action-issue-a",
  expectedRevision: 1,
  title: "Updated title",
  labels: ["backend", "Security"],
  assigneeId: null,
})

const manualDecisionBody = {
  decision: "yes" as const,
  idempotencyKey: "decision-manual-update",
}

const prepareManualUpdateFixture = async () => {
  const { app, db } = await createFixture()
  const { internal, run } = await createRun(db, {
    clientMessageId: "manual-update",
  })
  const prepared = await internal.prepareUpdateIssue({
    grant: run.grant,
    toolCallId: "tool-manual-update",
    idempotencyKey: "prepare-manual-update",
    issue: manualUpdateIssue(),
  })
  return { app, db, internal, prepared, run }
}

type ManualUpdateFixture = Awaited<
  ReturnType<typeof prepareManualUpdateFixture>
>

const approveManualUpdate = async (fixture: ManualUpdateFixture) => {
  const response = await fixture.app.handle(
    request(`/agent/actions/${fixture.prepared.id}/decision`, {
      method: "POST",
      body: manualDecisionBody,
    })
  )
  expect(response.status).toBe(200)
  return response
}

const issueManualUpdateContinuation = async (fixture: ManualUpdateFixture) => {
  const resumeTicket = await issueAgentActionResumeTicket(fixture.db, {
    actionId: fixture.prepared.id,
    sessionId: "action-session-a",
    userId: "action-user-a",
  })
  const continuation = await fixture.internal.resumeApprovedAction({
    actionId: fixture.prepared.id,
    resumeTicket: resumeTicket.ticket,
  })
  return { continuation, resumeTicket }
}

const executeManualUpdate = async (fixture: ManualUpdateFixture) => {
  await approveManualUpdate(fixture)
  const { continuation } = await issueManualUpdateContinuation(fixture)
  return fixture.internal.executeApprovedAction({
    grant: continuation.grant,
    actionId: fixture.prepared.id,
  })
}

const prepareRejectedUpdateFixture = async () => {
  const { app, db } = await createFixture()
  const runFixture = await createRun(db, { clientMessageId: "reject-first" })
  const rejected = await runFixture.internal.prepareUpdateIssue({
    grant: runFixture.run.grant,
    toolCallId: "tool-reject-first",
    idempotencyKey: "prepare-reject-first",
    issue: {
      issueId: "action-issue-a",
      expectedRevision: 1,
      title: "Must not be applied",
    },
  })
  const decision = {
    decision: "no" as const,
    idempotencyKey: "decision-reject-shared",
  }
  const response = await app.handle(
    request(`/agent/actions/${rejected.id}/decision`, {
      method: "POST",
      body: decision,
    })
  )
  expect(response.status).toBe(200)
  return { app, db, decision, rejected, response, ...runFixture }
}

describe("Agent Issueのmanual approval実行", () => {
  it("内部run grantでpending approval actionをcancelする", async () => {
    const { db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "internal-cancel-waiting-approval",
    })
    const prepared = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-internal-cancel",
      idempotencyKey: "prepare-internal-cancel",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        title: "Must not execute",
      },
    })

    await expect(
      internal.finalizeRun({ grant: run.grant, outcome: "canceled" })
    ).resolves.toEqual({ runId: run.runId, status: "canceled" })
    const [storedAction] = await db
      .select({
        completedAt: schema.agentActions.completedAt,
        status: schema.agentActions.status,
      })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, prepared.id))
    expect(storedAction).toMatchObject({
      completedAt: expect.any(Date),
      status: "canceled",
    })
    const liveGrants = await db
      .select({ id: schema.agentGrants.id })
      .from(schema.agentGrants)
      .where(
        and(
          eq(schema.agentGrants.runId, run.runId),
          isNull(schema.agentGrants.revokedAt)
        )
      )
    expect(liveGrants).toEqual([])
  })

  it("waiting approval actionをcancelして未使用resume ticketを失効させる", async () => {
    const { app, db } = await createFixture()
    const { internal, run, thread } = await createRun(db, {
      clientMessageId: "cancel-waiting-approval",
    })
    const prepared = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-cancel-waiting-approval",
      idempotencyKey: "prepare-cancel-waiting-approval",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        title: "Must never execute",
      },
    })
    const decided = await app.handle(
      request(`/agent/actions/${prepared.id}/decision`, {
        method: "POST",
        body: {
          decision: "yes",
          idempotencyKey: "decision-cancel-waiting-approval",
        },
      })
    )
    expect(decided.status).toBe(200)
    const resumeTicket = await issueAgentActionResumeTicket(db, {
      actionId: prepared.id,
      sessionId: "action-session-a",
      userId: "action-user-a",
    })

    const canceled = await app.handle(
      request(`/agent/threads/${thread.id}/runs/${run.runId}/cancel`, {
        method: "POST",
      })
    )
    expect(canceled.status).toBe(200)
    expect(await canceled.json()).toEqual({
      runId: run.runId,
      status: "canceled",
    })

    const [storedAction] = await db
      .select({
        completedAt: schema.agentActions.completedAt,
        status: schema.agentActions.status,
      })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, prepared.id))
    expect(storedAction?.status).toBe("canceled")
    expect(storedAction?.completedAt).toBeInstanceOf(Date)
    const [storedTicket] = await db
      .select({
        consumedAt: schema.agentResumeTickets.consumedAt,
        revokedAt: schema.agentResumeTickets.revokedAt,
      })
      .from(schema.agentResumeTickets)
      .where(eq(schema.agentResumeTickets.actionId, prepared.id))
    expect(storedTicket).toMatchObject({
      consumedAt: null,
      revokedAt: expect.any(Date),
    })
    await expect(
      internal.resumeApprovedAction({
        actionId: prepared.id,
        resumeTicket: resumeTicket.ticket,
      })
    ).rejects.toMatchObject({ code: "unauthorized" })
    const [issue] = await db
      .select({ revision: schema.issues.revision, title: schema.issues.title })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issue).toEqual({ revision: 1, title: "Original title" })
  })

  it("manual updateへ正規化した差分previewを返す", async () => {
    const { prepared } = await prepareManualUpdateFixture()

    expect(prepared).toMatchObject({
      kind: "update_issue",
      status: "pending",
      requiresApproval: true,
      preview: {
        issueNumber: 1,
        issueRevision: 1,
      },
    })
    expect(prepared.preview?.fields).toEqual(
      expect.arrayContaining([
        { field: "title", before: "Original title", after: "Updated title" },
        {
          field: "labels",
          before: ["Backend"],
          after: ["Backend", "Security"],
        },
      ])
    )
  })

  it("同じprepare keyの異なるpayloadを拒否する", async () => {
    const { internal, run } = await prepareManualUpdateFixture()

    await expect(
      internal.prepareUpdateIssue({
        grant: run.grant,
        toolCallId: "tool-manual-update",
        idempotencyKey: "prepare-manual-update",
        issue: {
          ...manualUpdateIssue(),
          title: "Changed retry payload",
        },
      })
    ).rejects.toMatchObject({
      code: "conflict",
    })
  })

  it("公開actionから内部scopeを隠して別ownerへnot foundを返す", async () => {
    const { app, prepared } = await prepareManualUpdateFixture()

    const publicResponse = await app.handle(
      request(`/agent/actions/${prepared.id}`)
    )
    expect(publicResponse.status).toBe(200)
    const publicAction = await publicResponse.json()
    expect(publicAction).not.toHaveProperty("normalizedPayload")
    expect(publicAction).not.toHaveProperty("organizationId")
    expect(publicAction).not.toHaveProperty("runId")

    const otherOwner = await app.handle(
      request(`/agent/actions/${prepared.id}`, {
        userId: "action-user-b",
        sessionId: "action-session-b",
        requestId: "req_action_visibility",
      })
    )
    const missing = await app.handle(
      request("/agent/actions/missing-action-id", {
        userId: "action-user-b",
        sessionId: "action-session-b",
        requestId: "req_action_visibility",
      })
    )
    expect(otherOwner.status).toBe(404)
    expect(await otherOwner.json()).toMatchObject(await missing.json())
  })

  it("承認後もhash保存した1回限りのcontinuationだけを許可する", async () => {
    const fixture = await prepareManualUpdateFixture()
    const { db, prepared } = fixture

    const decided = await approveManualUpdate(fixture)
    expect(await decided.json()).toMatchObject({
      status: "approved",
      approvalMode: "manual",
    })

    const resumeTicket = await issueAgentActionResumeTicket(db, {
      actionId: prepared.id,
      sessionId: "action-session-a",
      userId: "action-user-a",
    })
    const storedTicket = await db
      .select({ tokenHash: schema.agentResumeTickets.tokenHash })
      .from(schema.agentResumeTickets)
      .where(eq(schema.agentResumeTickets.actionId, prepared.id))
    expect(storedTicket[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(storedTicket[0]?.tokenHash).not.toBe(resumeTicket.ticket)
  })

  it("manual continuationだけでupdateと最小audit metadataをcommitする", async () => {
    const fixture = await prepareManualUpdateFixture()
    const { db, internal, prepared, run } = fixture
    await approveManualUpdate(fixture)

    await expect(
      internal.executeApprovedAction({
        grant: run.grant,
        actionId: prepared.id,
      })
    ).rejects.toMatchObject({ code: "unauthorized" })

    const { continuation } = await issueManualUpdateContinuation(fixture)

    const result = await internal.executeApprovedAction({
      grant: continuation.grant,
      actionId: prepared.id,
    })
    expect(result).toEqual({
      actionId: prepared.id,
      kind: "update_issue",
      status: "succeeded",
      issue: {
        id: "action-issue-a",
        number: 1,
        revision: 2,
        deleted: false,
      },
    })

    const issueRows = await db
      .select()
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issueRows[0]).toMatchObject({
      title: "Updated title",
      labels: ["Backend", "Security"],
      assigneeId: null,
      revision: 2,
    })
    const auditRows = await db
      .select({ metadata: schema.auditLogs.metadata })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.targetId, "action-issue-a"),
          eq(schema.auditLogs.action, "issue.updated")
        )
      )
    expect(auditRows).toEqual([
      {
        metadata: {
          number: 1,
          source: "agent",
          approvalMode: "manual",
          actionId: prepared.id,
        },
      },
    ])
    expect(JSON.stringify(auditRows)).not.toContain("Updated title")
    expect(JSON.stringify(auditRows)).not.toContain("normalizedPayload")
  })

  it("実行済みreceiptをowner内で再生してterminal stateを保つ", async () => {
    const fixture = await prepareManualUpdateFixture()
    const { app, prepared } = fixture
    const result = await executeManualUpdate(fixture)

    const replayedReceipt = await app.handle(
      request(`/agent/actions/${prepared.id}/resume`, {
        method: "POST",
        body: {},
      })
    )
    expect(replayedReceipt.status).toBe(200)
    expect(await replayedReceipt.json()).toEqual(result)
    const crossOwnerReplay = await app.handle(
      request(`/agent/actions/${prepared.id}/resume`, {
        method: "POST",
        body: {},
        userId: "action-user-b",
        sessionId: "action-session-b",
      })
    )
    expect(crossOwnerReplay.status).toBe(404)

    const decisionAfterExecution = await app.handle(
      request(`/agent/actions/${prepared.id}/decision`, {
        method: "POST",
        body: manualDecisionBody,
      })
    )
    expect(decisionAfterExecution.status).toBe(200)
    expect(await decisionAfterExecution.json()).toMatchObject({
      status: "succeeded",
    })
  })
})

describe("Agent Issueのmanual approval競合とaccess scope", () => {
  it("承認済みpayloadを適用せず古いrevisionをconflictedとしてcommitする", async () => {
    const { app, db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "stale-update",
    })
    const prepared = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-stale-update",
      idempotencyKey: "prepare-stale-update",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        description: "Agent stale description",
      },
    })
    await app.handle(
      request(`/agent/actions/${prepared.id}/decision`, {
        method: "POST",
        body: {
          decision: "yes",
          idempotencyKey: "decision-stale-update",
        },
      })
    )
    await updateIssueById(db, {
      id: "action-issue-a",
      actorUserId: "action-user-a",
      organizationId: "action-org-a",
      description: "Human edit wins",
    })
    const resume = await issueAgentActionResumeTicket(db, {
      actionId: prepared.id,
      sessionId: "action-session-a",
      userId: "action-user-a",
    })
    const continuation = await internal.resumeApprovedAction({
      actionId: prepared.id,
      resumeTicket: resume.ticket,
    })
    await expect(
      internal.executeApprovedAction({
        grant: continuation.grant,
        actionId: prepared.id,
      })
    ).rejects.toMatchObject({
      code: "conflict",
    })
    const [action] = await db
      .select({
        status: schema.agentActions.status,
        errorClassification: schema.agentActions.errorClassification,
      })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, prepared.id))
    expect(action).toEqual({
      status: "conflicted",
      errorClassification: "stale_revision",
    })
    const [issue] = await db
      .select({
        description: schema.issues.description,
        revision: schema.issues.revision,
      })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issue).toEqual({ description: "Human edit wins", revision: 2 })
  })

  it("別テナントのIssue actionをnot foundで隠す", async () => {
    const { db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "cross-tenant-update",
    })

    await expect(
      internal.prepareUpdateIssue({
        grant: run.grant,
        toolCallId: "tool-cross-tenant",
        idempotencyKey: "prepare-cross-tenant",
        issue: {
          issueId: "action-issue-other",
          expectedRevision: 1,
          title: "Must stay hidden",
        },
      })
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("rejectionをterminalにして元run grantとresumeを失効させる", async () => {
    const { db, internal, rejected, response, run } =
      await prepareRejectedUpdateFixture()

    expect(await response.json()).toMatchObject({ status: "rejected" })
    const liveRejectedRunGrants = await db
      .select({ id: schema.agentGrants.id })
      .from(schema.agentGrants)
      .where(
        and(
          eq(schema.agentGrants.runId, run.runId),
          isNull(schema.agentGrants.revokedAt)
        )
      )
    expect(liveRejectedRunGrants).toEqual([])
    await expect(
      internal.executeApprovedAction({
        grant: run.grant,
        actionId: rejected.id,
      })
    ).rejects.toMatchObject({ code: "unauthorized" })
    await expect(
      issueAgentActionResumeTicket(db, {
        actionId: rejected.id,
        sessionId: "action-session-a",
        userId: "action-user-a",
      })
    ).rejects.toMatchObject({ code: "conflict" })
    const [issue] = await db
      .select({ revision: schema.issues.revision, title: schema.issues.title })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issue).toEqual({ revision: 1, title: "Original title" })
  })

  it("rejected runを新しいattemptとgrantで再試行する", async () => {
    const { db, internal, run, thread } = await prepareRejectedUpdateFixture()
    const retryTicket = await issueAgentConnectionTicket(db, {
      sessionId: "action-session-a",
      threadId: thread.id,
      userId: "action-user-a",
    })
    const retryChatRun = await internal.startChatRun({
      clientMessageId: "reject-first",
      threadId: thread.id,
      ticket: retryTicket.ticket,
    })
    const retryRun = retryChatRun.run
    expect(retryRun).toMatchObject({
      attempt: 2,
      runId: run.runId,
    })
    await expect(
      internal.getIssue({
        grant: retryRun.grant,
        lookup: "id",
        id: "action-issue-a",
      })
    ).resolves.toMatchObject({ id: "action-issue-a" })
    const liveRetryGrants = await db
      .select({ id: schema.agentGrants.id })
      .from(schema.agentGrants)
      .where(
        and(
          eq(schema.agentGrants.runId, retryRun.runId),
          isNull(schema.agentGrants.revokedAt)
        )
      )
    expect(liveRetryGrants).toHaveLength(1)
    await internal.finalizeRun({
      grant: retryRun.grant,
      outcome: "canceled",
    })
  })

  it("decision idempotency keyを1つのactionへscopeする", async () => {
    const { app, db, decision } = await prepareRejectedUpdateFixture()

    const second = await createRun(db, { clientMessageId: "reject-second" })
    const pending = await second.internal.prepareUpdateIssue({
      grant: second.run.grant,
      toolCallId: "tool-reject-second",
      idempotencyKey: "prepare-reject-second",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        priority: "urgent",
      },
    })
    const collision = await app.handle(
      request(`/agent/actions/${pending.id}/decision`, {
        method: "POST",
        body: { decision: "yes", idempotencyKey: decision.idempotencyKey },
      })
    )
    expect(collision.status).toBe(409)
    expect(await collision.json()).toMatchObject({
      error: "conflict",
    })
    const [issue] = await db
      .select({ revision: schema.issues.revision, title: schema.issues.title })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issue).toEqual({ revision: 1, title: "Original title" })
  })

  it("full access scopeでmanual approvalなしにupdateする", async () => {
    const { app, db } = await createFixture()
    const autoRun = await createRun(db, { clientMessageId: "auto-write" })
    const putAutoWrite = await app.handle(
      request(`/agent/threads/${autoRun.thread.id}/permission`, {
        method: "PUT",
        body: { mode: "full_access" },
      })
    )
    expect(putAutoWrite.status).toBe(200)
    expect(await putAutoWrite.json()).toMatchObject({
      mode: "full_access",
      permissions: {
        createIssue: true,
        updateIssue: true,
        deleteIssue: true,
      },
    })
    const autoUpdate = await autoRun.internal.prepareUpdateIssue({
      grant: autoRun.run.grant,
      toolCallId: "tool-auto-update",
      idempotencyKey: "prepare-auto-update",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        priority: "high",
      },
    })
    expect(autoUpdate).toMatchObject({
      status: "approved",
      approvalMode: "full_access",
    })
    await expect(
      autoRun.internal.executeApprovedAction({
        grant: autoRun.run.grant,
        actionId: autoUpdate.id,
      })
    ).resolves.toMatchObject({ issue: { revision: 2 } })
  })

  it("memberによる他user所有Issueの削除を拒否する", async () => {
    const { db } = await createFixture()
    const memberRun = await createRun(db, {
      clientMessageId: "member-delete",
      userId: "action-user-b",
      sessionId: "action-session-b",
    })
    await expect(
      memberRun.internal.prepareDeleteIssue({
        grant: memberRun.run.grant,
        toolCallId: "tool-member-delete",
        idempotencyKey: "prepare-member-delete",
        issue: { issueId: "action-issue-a", expectedRevision: 1 },
      })
    ).rejects.toMatchObject({ code: "forbidden" })
  })
})
