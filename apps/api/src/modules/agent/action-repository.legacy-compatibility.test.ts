import * as schema from "@enterprise-agentic-saas/db/schema"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  createFixture,
  createRun,
  request,
} from "./action-repository.test-support"
import {
  agentActionExecutionResultModel,
  agentIssueActionModel,
} from "./action-schema"
import { sweepAgentActions } from "./actions/execution-repository"
import { issueAgentActionResumeTicket } from "./actions/repository"
import {
  ACTION_TERMINAL_RETENTION_MS,
  actionRequestFingerprint,
} from "./actions/repository-support"

const legacyIssueInput = {
  issueId: "action-issue-a",
  expectedRevision: 1,
  title: "Legacy updated title",
}

const insertLegacyPendingUpdate = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  run: Awaited<ReturnType<typeof createRun>>["run"],
  thread: Awaited<ReturnType<typeof createRun>>["thread"],
  now: Date
) => {
  const requestFingerprint = await actionRequestFingerprint({
    issue: legacyIssueInput,
    kind: "update_issue",
  })
  const normalizedPayload = {
    requestFingerprint,
    issueId: legacyIssueInput.issueId,
    expectedRevision: legacyIssueInput.expectedRevision,
    changes: { title: legacyIssueInput.title },
  }
  const canonicalPreview = {
    kind: "update_issue",
    destructive: false,
    title: "Original title",
    issueNumber: 1,
    issueRevision: 1,
    fields: [
      {
        field: "title",
        before: "Original title",
        after: legacyIssueInput.title,
      },
    ],
    attachments: [],
  }
  await fixture.db.insert(schema.agentActions).values({
    id: "legacy-update-action",
    organizationId: "action-org-a",
    threadId: thread.id,
    runId: run.runId,
    sessionId: "action-session-a",
    userId: "action-user-a",
    contextEpoch: 1,
    toolCallId: "legacy-update-tool",
    kind: "update_issue",
    normalizedPayload,
    canonicalPreview,
    targetId: legacyIssueInput.issueId,
    targetRevision: legacyIssueInput.expectedRevision,
    status: "pending",
    idempotencyKey: "legacy-update-idempotency",
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 600_000),
  })
  await fixture.db
    .update(schema.agentRuns)
    .set({ status: "waiting_approval" })
    .where(
      and(
        eq(schema.agentRuns.organizationId, "action-org-a"),
        eq(schema.agentRuns.id, run.runId)
      )
    )
  return { canonicalPreview, normalizedPayload }
}

describe("Agent legacy update action compatibility", () => {
  it("replays, decides, executes, and retains a pre-operation action", async () => {
    const fixture = await createFixture()
    const started = await createRun(fixture.db, {
      clientMessageId: "legacy-update-compatibility",
    })
    const now = new Date()
    const legacy = await insertLegacyPendingUpdate(
      fixture,
      started.run,
      started.thread,
      now
    )

    await expect(
      started.internal.prepareUpdateIssue({
        grant: started.run.grant,
        toolCallId: "legacy-update-tool",
        idempotencyKey: "legacy-update-idempotency",
        issue: legacyIssueInput,
      })
    ).resolves.toMatchObject({
      id: "legacy-update-action",
      status: "pending",
      preview: {
        attachmentOperation: null,
        attachments: [],
      },
    })
    await expect(
      started.internal.prepareUpdateIssue({
        grant: started.run.grant,
        toolCallId: "legacy-update-tool",
        idempotencyKey: "legacy-update-idempotency",
        issue: { ...legacyIssueInput, title: "Changed retry" },
      })
    ).rejects.toMatchObject({
      code: "conflict",
    })

    const pendingResponse = await fixture.app.handle(
      request("/agent/actions/legacy-update-action")
    )
    expect(pendingResponse.status).toBe(200)
    const pending = v.parse(agentIssueActionModel, await pendingResponse.json())
    expect(pending.preview).toMatchObject({
      attachmentOperation: null,
      attachments: [],
    })

    const decisionResponse = await fixture.app.handle(
      request("/agent/actions/legacy-update-action/decision", {
        method: "POST",
        body: {
          decision: "yes",
          idempotencyKey: "legacy-update-decision",
        },
      })
    )
    expect(decisionResponse.status).toBe(200)
    expect(
      v.parse(agentIssueActionModel, await decisionResponse.json())
    ).toMatchObject({
      id: "legacy-update-action",
      status: "approved",
      approvalMode: "manual",
    })

    const resumeTicket = await issueAgentActionResumeTicket(fixture.db, {
      actionId: "legacy-update-action",
      sessionId: "action-session-a",
      userId: "action-user-a",
    })
    const continuation = await started.internal.resumeApprovedAction({
      actionId: "legacy-update-action",
      resumeTicket: resumeTicket.ticket,
    })
    const result = await started.internal.executeApprovedAction({
      grant: continuation.grant,
      actionId: "legacy-update-action",
    })
    expect(result).toEqual({
      actionId: "legacy-update-action",
      kind: "update_issue",
      status: "succeeded",
      issue: {
        id: "action-issue-a",
        number: 1,
        revision: 2,
        deleted: false,
      },
    })
    await expect(
      started.internal.executeApprovedAction({
        grant: continuation.grant,
        actionId: "legacy-update-action",
      })
    ).resolves.toEqual(result)

    const terminalResponse = await fixture.app.handle(
      request("/agent/actions/legacy-update-action/resume", {
        method: "POST",
        body: {},
      })
    )
    expect(terminalResponse.status).toBe(200)
    expect(
      v.parse(agentActionExecutionResultModel, await terminalResponse.json())
    ).toEqual(result)
    const terminalActionResponse = await fixture.app.handle(
      request("/agent/actions/legacy-update-action")
    )
    expect(terminalActionResponse.status).toBe(200)
    expect(
      v.parse(agentIssueActionModel, await terminalActionResponse.json())
    ).toMatchObject({
      id: "legacy-update-action",
      status: "succeeded",
      preview: {
        attachmentOperation: null,
        attachments: [],
      },
      previewState: "available",
    })
    const [storedBeforeScrub] = await fixture.db
      .select({
        canonicalPreview: schema.agentActions.canonicalPreview,
        normalizedPayload: schema.agentActions.normalizedPayload,
      })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, "legacy-update-action"))
    expect(storedBeforeScrub).toEqual(legacy)

    const auditRows = await fixture.db
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.action, "issue.updated"),
          eq(schema.auditLogs.targetId, "action-issue-a")
        )
      )
    expect(auditRows).toHaveLength(1)

    const [storedTerminal] = await fixture.db
      .select({ completedAt: schema.agentActions.completedAt })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, "legacy-update-action"))
    if (!storedTerminal?.completedAt) {
      throw new Error("Legacy action must have a completion timestamp")
    }
    expect(storedTerminal.completedAt).toBeInstanceOf(Date)
    const retentionBase = storedTerminal.completedAt
    await expect(
      sweepAgentActions(
        fixture.db,
        new Date(retentionBase.getTime() + ACTION_TERMINAL_RETENTION_MS + 1)
      )
    ).resolves.toEqual({ expired: 0, scrubbed: 1 })

    const scrubbedResponse = await fixture.app.handle(
      request("/agent/actions/legacy-update-action")
    )
    expect(scrubbedResponse.status).toBe(200)
    expect(
      v.parse(agentIssueActionModel, await scrubbedResponse.json())
    ).toMatchObject({
      id: "legacy-update-action",
      status: "succeeded",
      preview: null,
      previewState: "expired",
    })
  })
})
