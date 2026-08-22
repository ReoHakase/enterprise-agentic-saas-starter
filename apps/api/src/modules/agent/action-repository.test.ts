import * as schema from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import {
  createFixture,
  createRun,
  request,
} from "./action-repository.test-support"
import {
  prepareCreateIssueAction,
  putAgentApprovalPolicyForSession,
  sweepAgentActions,
} from "./actions/repository"
import { issueAgentConnectionTicket } from "./threads/repository"

describe("Agent Issue action protocol", () => {
  it("does not expire another organization's action from a tenant request", async () => {
    const { db } = await createFixture()
    const now = new Date()
    await db.insert(schema.session).values({
      id: "action-session-other",
      userId: "action-user-a",
      token: "action-token-other",
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "action-org-b",
    })
    const otherRun = await createRun(db, {
      clientMessageId: "expired-other-tenant",
      sessionId: "action-session-other",
    })
    const otherAction = await prepareCreateIssueAction(db, {
      grant: otherRun.run.grant,
      toolCallId: "tool-expired-other-tenant",
      idempotencyKey: "prepare-expired-other-tenant",
      issue: { title: "Expired other-tenant action" },
      now: new Date(now.getTime() - 16 * 60 * 1000),
    })
    expect(otherAction.status).toBe("pending")

    const currentRun = await createRun(db, {
      clientMessageId: "current-tenant-expiration",
    })
    await prepareCreateIssueAction(db, {
      grant: currentRun.run.grant,
      toolCallId: "tool-current-tenant-expiration",
      idempotencyKey: "prepare-current-tenant-expiration",
      issue: { title: "Current tenant action" },
      now,
    })

    const [afterTenantRequest] = await db
      .select({ status: schema.agentActions.status })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, otherAction.id))
    expect(afterTenantRequest?.status).toBe("pending")

    await sweepAgentActions(db, now)
    const [afterSweep] = await db
      .select({ status: schema.agentActions.status })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, otherAction.id))
    expect(afterSweep?.status).toBe("expired")
  })

  it("loads an archived thread approval from a replacement session but keeps decision scope strict", async () => {
    const { app, db } = await createFixture()
    const { internal, run, thread } = await createRun(db, {
      clientMessageId: "historical-approval-session",
    })
    const action = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-historical-approval-session",
      idempotencyKey: "prepare-historical-approval-session",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        priority: "high",
      },
    })
    const now = new Date()
    await db.insert(schema.session).values({
      id: "action-session-replacement",
      userId: "action-user-a",
      token: "action-token-replacement",
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "action-org-a",
    })
    const archived = await app.handle(
      request(`/agent/threads/${thread.id}/archive`, {
        method: "POST",
        body: {},
      })
    )
    expect(archived.status).toBe(200)

    const historical = await app.handle(
      request(`/agent/actions/${action.id}`, {
        sessionId: "action-session-replacement",
      })
    )
    expect(historical.status).toBe(200)
    expect(await historical.json()).toMatchObject({
      id: action.id,
      status: "canceled",
      previewState: "available",
    })

    const decision = await app.handle(
      request(`/agent/actions/${action.id}/decision`, {
        method: "POST",
        sessionId: "action-session-replacement",
        body: {
          decision: "yes",
          idempotencyKey: "replacement-session-must-not-decide",
        },
      })
    )
    expect(decision.status).toBe(404)

    await sweepAgentActions(
      db,
      new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
    )
    const expired = await app.handle(
      request(`/agent/actions/${action.id}`, {
        sessionId: "action-session-replacement",
      })
    )
    expect(expired.status).toBe(200)
    expect(await expired.json()).toMatchObject({
      id: action.id,
      status: "canceled",
      preview: null,
      previewState: "expired",
    })
  })

  it("converges parallel retries of the same manual decision", async () => {
    const { app, db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "parallel-manual-decision",
    })
    const prepared = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-parallel-manual-decision",
      idempotencyKey: "prepare-parallel-manual-decision",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        priority: "high",
      },
    })
    const decide = () =>
      app.handle(
        request(`/agent/actions/${prepared.id}/decision`, {
          method: "POST",
          body: {
            decision: "yes",
            idempotencyKey: "decision-parallel-manual-decision",
          },
        })
      )

    const responses = await Promise.all([decide(), decide()])
    expect(responses.map(({ status }) => status)).toEqual([200, 200])
    await expect(
      Promise.all(responses.map((response) => response.json()))
    ).resolves.toEqual([
      expect.objectContaining({ id: prepared.id, status: "approved" }),
      expect.objectContaining({ id: prepared.id, status: "approved" }),
    ])
  })

  it("converges parallel retries of the same action preparation", async () => {
    const { db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "parallel-action-prepare",
    })
    const prepare = () =>
      internal.prepareUpdateIssue({
        grant: run.grant,
        toolCallId: "tool-parallel-action-prepare",
        idempotencyKey: "prepare-parallel-action-prepare",
        issue: {
          issueId: "action-issue-a",
          expectedRevision: 1,
          priority: "high",
        },
      })

    const actions = await Promise.all([prepare(), prepare()])
    expect(actions).toEqual([
      expect.objectContaining({ status: "pending" }),
      expect.objectContaining({ status: "pending" }),
    ])
    expect(actions[0]?.id).toBe(actions[1]?.id)
    const [root] = await db
      .select({ writeCount: schema.agentRuns.writeCount })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, run.rootRunId))
    expect(root?.writeCount).toBe(1)
  })

  it("converges parallel executions of the same approved action", async () => {
    const { db } = await createFixture()
    const { internal, run, thread } = await createRun(db, {
      clientMessageId: "parallel-approved-execution",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
    })
    const prepared = await internal.prepareCreateIssue({
      grant: run.grant,
      toolCallId: "tool-parallel-approved-execution",
      idempotencyKey: "prepare-parallel-approved-execution",
      issue: { title: "Parallel execution" },
    })
    const execute = () =>
      internal.executeApprovedAction({
        grant: run.grant,
        actionId: prepared.id,
      })

    const results = await Promise.all([execute(), execute()])
    expect(results).toEqual([
      expect.objectContaining({ actionId: prepared.id, status: "succeeded" }),
      expect.objectContaining({ actionId: prepared.id, status: "succeeded" }),
    ])
    expect(results[0]?.issue).toEqual(results[1]?.issue)
    expect(
      await db
        .select({ id: schema.issues.id })
        .from(schema.issues)
        .where(eq(schema.issues.title, "Parallel execution"))
    ).toHaveLength(1)
  })

  it("replays a succeeded write receipt across a failed-run retry", async () => {
    const { db } = await createFixture()
    const first = await createRun(db, {
      clientMessageId: "retry-succeeded-write",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: first.thread.id,
      mode: "full_access",
    })
    const issueInput = {
      issueId: "action-issue-a",
      expectedRevision: 1,
      priority: "high" as const,
    }
    const prepared = await first.internal.prepareUpdateIssue({
      grant: first.run.grant,
      toolCallId: "provider-tool-first-attempt",
      idempotencyKey: "stable-logical-write-identity",
      issue: issueInput,
    })
    const firstReceipt = await first.internal.executeApprovedAction({
      grant: first.run.grant,
      actionId: prepared.id,
    })
    await first.internal.finalizeRun({
      grant: first.run.grant,
      outcome: "failed",
    })

    const retryTicket = await issueAgentConnectionTicket(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: first.thread.id,
    })
    const retryChatRun = await first.internal.startChatRun({
      clientMessageId: "retry-succeeded-write",
      ticket: retryTicket.ticket,
      threadId: first.thread.id,
    })
    const retryRun = retryChatRun.run
    expect(retryRun).toMatchObject({
      attempt: 2,
      rootRunId: first.run.rootRunId,
      runId: first.run.runId,
    })
    const replayedAction = await first.internal.prepareUpdateIssue({
      grant: retryRun.grant,
      toolCallId: "provider-tool-second-attempt",
      idempotencyKey: "stable-logical-write-identity",
      issue: issueInput,
    })
    expect(replayedAction).toMatchObject({
      id: prepared.id,
      status: "succeeded",
    })
    await expect(
      first.internal.executeApprovedAction({
        grant: retryRun.grant,
        actionId: replayedAction.id,
      })
    ).resolves.toEqual(firstReceipt)

    const issueRows = await db
      .select({ revision: schema.issues.revision })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issueRows).toEqual([{ revision: 2 }])
    const auditRows = await db
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.targetId, "action-issue-a"),
          eq(schema.auditLogs.action, "issue.updated")
        )
      )
    expect(auditRows).toHaveLength(1)
  })

  it("allocates distinct Issue numbers for parallel approved creates", async () => {
    const { db } = await createFixture()
    const { internal, run, thread } = await createRun(db, {
      clientMessageId: "parallel-approved-creates",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
    })
    const first = await internal.prepareCreateIssue({
      grant: run.grant,
      toolCallId: "tool-parallel-create-first",
      idempotencyKey: "prepare-parallel-create-first",
      issue: { title: "Parallel create first" },
    })
    const second = await internal.prepareCreateIssue({
      grant: run.grant,
      toolCallId: "tool-parallel-create-second",
      idempotencyKey: "prepare-parallel-create-second",
      issue: { title: "Parallel create second" },
    })
    const actions = [first, second]

    const results = await Promise.all(
      actions.map((action) =>
        internal.executeApprovedAction({
          grant: run.grant,
          actionId: action.id,
        })
      )
    )
    expect(results.map(({ issue }) => issue.number).toSorted()).toEqual([2, 3])
    expect(new Set(results.map(({ issue }) => issue.id)).size).toBe(2)
  })
})
