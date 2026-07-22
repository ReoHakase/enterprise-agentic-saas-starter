import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { and, eq, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach, describe, expect, it } from "vitest"

import { createApp } from "../../app"
import { env } from "../../env"
import { findPreviewableAgentAssetForSession } from "../files/agent-assets-repository"
import { agentAssetObjectKey } from "../files/constants"
import { updateIssueById } from "../issues/repository"
import { insertOrganizationWithSuperAdmin } from "../organizations/repository"
import {
  deleteAgentApprovalPolicyForSession,
  getAgentApprovalPolicyForSession,
  issueAgentActionResumeTicket,
  prepareCreateIssueAction,
  putAgentApprovalPolicyForSession,
  resumeAgentApprovedAction,
  sweepAgentActions,
} from "./actions/repository"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle",
  import.meta.url
).pathname

const clients: Array<ReturnType<typeof createClient>> = []
const databasePaths: string[] = []

afterEach(async () => {
  for (const client of clients.splice(0)) client.close()
  await Promise.all(
    databasePaths.splice(0).map((path) => rm(path, { force: true }))
  )
})

const createFixture = async () => {
  const databasePath = join(
    tmpdir(),
    `enterprise-agent-action-${crypto.randomUUID()}.db`
  )
  databasePaths.push(databasePath)
  const client = createClient({ url: `file:${databasePath}` })
  clients.push(client)
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 3_600_000)
  await db.insert(schema.user).values([
    {
      id: "action-user-a",
      name: "Action User A",
      email: "action-a@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "action-user-b",
      name: "Action User B",
      email: "action-b@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(schema.organization).values([
    {
      id: "action-org-a",
      name: "Action Org A",
      slug: "action-org-a",
      createdAt: now,
    },
    {
      id: "action-org-b",
      name: "Action Org B",
      slug: "action-org-b",
      createdAt: now,
    },
  ])
  await db.insert(schema.member).values([
    {
      id: "action-member-a",
      organizationId: "action-org-a",
      userId: "action-user-a",
      role: "super_admin",
      createdAt: now,
    },
    {
      id: "action-member-b",
      organizationId: "action-org-a",
      userId: "action-user-b",
      role: "member",
      createdAt: now,
    },
    {
      id: "action-member-other",
      organizationId: "action-org-b",
      userId: "action-user-a",
      role: "super_admin",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values([
    {
      id: "action-session-a",
      userId: "action-user-a",
      token: "action-token-a",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "action-org-a",
    },
    {
      id: "action-session-b",
      userId: "action-user-b",
      token: "action-token-b",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "action-org-a",
    },
  ])
  await db.insert(schema.issues).values([
    {
      id: "action-issue-a",
      organizationId: "action-org-a",
      number: 1,
      title: "Original title",
      description: "Original description",
      status: "open",
      priority: "medium",
      assigneeId: "action-user-b",
      creatorId: "action-user-a",
      labels: ["Backend"],
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "action-issue-other",
      organizationId: "action-org-b",
      number: 1,
      title: "Other tenant",
      description: "Not visible",
      status: "open",
      priority: "urgent",
      creatorId: "action-user-a",
      labels: [],
      createdAt: now,
      updatedAt: now,
    },
  ])
  return { app: createApp(db), client, db }
}

const requestHeaders = (
  userId = "action-user-a",
  sessionId = "action-session-a",
  activeOrganizationId = "action-org-a",
  requestId?: string
) => ({
  "content-type": "application/json",
  ...(requestId === undefined ? {} : { "x-request-id": requestId }),
  "x-test-user-id": userId,
  "x-test-session-id": sessionId,
  "x-test-active-organization-id": activeOrganizationId,
  "x-test-session-created-at": new Date().toISOString(),
  origin: env.CORS_ORIGIN[0] ?? env.API_PUBLIC_URL,
})

const request = (
  path: string,
  input: {
    body?: unknown
    method?: string
    userId?: string
    sessionId?: string
    activeOrganizationId?: string
    requestId?: string
  } = {}
) =>
  new Request(`http://localhost${path}`, {
    method: input.method ?? "GET",
    headers: requestHeaders(
      input.userId,
      input.sessionId,
      input.activeOrganizationId,
      input.requestId
    ),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })

const createRun = async (
  db: Awaited<ReturnType<typeof createFixture>>["db"],
  input: {
    clientMessageId: string
    userId?: string
    sessionId?: string
  }
) => {
  const userId = input.userId ?? "action-user-a"
  const sessionId = input.sessionId ?? "action-session-a"
  const thread = await createAgentThreadForSession(db, {
    sessionId,
    userId,
    title: `Action ${input.clientMessageId}`,
  })
  const ticket = await issueAgentConnectionTicket(db, {
    sessionId,
    userId,
    threadId: thread.id,
  })
  const internal = createAgentInternalApi(db)
  const connection = await internal.consumeConnectionTicket({
    ticket: ticket.ticket,
    threadId: thread.id,
  })
  const run = await internal.startRun({
    grant: connection.grant,
    clientMessageId: input.clientMessageId,
  })
  return { connection, internal, run, thread, ticket }
}

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
    await first.internal.finishRun({
      grant: first.run.grant,
      outcome: "failed",
    })

    const retryTicket = await issueAgentConnectionTicket(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: first.thread.id,
    })
    const retryConnection = await first.internal.consumeConnectionTicket({
      ticket: retryTicket.ticket,
      threadId: first.thread.id,
    })
    const retryRun = await first.internal.startRun({
      grant: retryConnection.grant,
      clientMessageId: "retry-succeeded-write",
    })
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

  it("executes a manual update only through a one-use continuation and keeps audit metadata minimal", async () => {
    const { app, db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "manual-update",
    })
    const prepared = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-manual-update",
      idempotencyKey: "prepare-manual-update",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        title: "Updated title",
        labels: ["backend", "Security"],
        assigneeId: null,
      },
    })
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
    await expect(
      internal.prepareUpdateIssue({
        grant: run.grant,
        toolCallId: "tool-manual-update",
        idempotencyKey: "prepare-manual-update",
        issue: {
          issueId: "action-issue-a",
          expectedRevision: 1,
          title: "Updated title",
          labels: ["backend", "Security"],
          assigneeId: null,
        },
      })
    ).resolves.toMatchObject({ id: prepared.id, status: "pending" })
    await expect(
      internal.prepareUpdateIssue({
        grant: run.grant,
        toolCallId: "tool-manual-update",
        idempotencyKey: "prepare-manual-update",
        issue: {
          issueId: "action-issue-a",
          expectedRevision: 1,
          title: "Changed retry payload",
          labels: ["backend", "Security"],
          assigneeId: null,
        },
      })
    ).rejects.toMatchObject({
      code: "conflict",
      publicContext: { reason: "idempotency_conflict" },
    })

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

    const decisionBody = {
      decision: "yes",
      idempotencyKey: "decision-manual-update",
    }
    const decided = await app.handle(
      request(`/agent/actions/${prepared.id}/decision`, {
        method: "POST",
        body: decisionBody,
      })
    )
    expect(decided.status).toBe(200)
    expect(await decided.json()).toMatchObject({
      status: "approved",
      approvalMode: "manual",
    })
    const repeatedDecision = await app.handle(
      request(`/agent/actions/${prepared.id}/decision`, {
        method: "POST",
        body: decisionBody,
      })
    )
    expect(repeatedDecision.status).toBe(200)

    await expect(
      internal.executeApprovedAction({
        grant: run.grant,
        actionId: prepared.id,
      })
    ).rejects.toMatchObject({ code: "unauthorized" })

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

    const continuation = await internal.resumeApprovedAction({
      actionId: prepared.id,
      resumeTicket: resumeTicket.ticket,
    })
    await expect(
      internal.resumeApprovedAction({
        actionId: prepared.id,
        resumeTicket: resumeTicket.ticket,
      })
    ).rejects.toMatchObject({ code: "unauthorized" })

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
    await expect(
      internal.executeApprovedAction({
        grant: continuation.grant,
        actionId: prepared.id,
      })
    ).resolves.toEqual(result)

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
    const unconsumedResumeTickets = await db
      .select({ id: schema.agentResumeTickets.id })
      .from(schema.agentResumeTickets)
      .where(
        and(
          eq(schema.agentResumeTickets.actionId, prepared.id),
          isNull(schema.agentResumeTickets.consumedAt),
          isNull(schema.agentResumeTickets.revokedAt)
        )
      )
    expect(unconsumedResumeTickets).toEqual([])

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

    const decisionAfterExecution = await app.handle(
      request(`/agent/actions/${prepared.id}/decision`, {
        method: "POST",
        body: decisionBody,
      })
    )
    expect(decisionAfterExecution.status).toBe(200)
    expect(await decisionAfterExecution.json()).toMatchObject({
      status: "succeeded",
    })
  })

  it("commits a stale revision as conflicted without applying the approved payload", async () => {
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
      publicContext: { reason: "stale_revision" },
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

  it("keeps rejection terminal and scopes decision idempotency keys to one action", async () => {
    const { app, db } = await createFixture()
    const first = await createRun(db, { clientMessageId: "reject-first" })
    await expect(
      first.internal.prepareUpdateIssue({
        grant: first.run.grant,
        toolCallId: "tool-cross-tenant",
        idempotencyKey: "prepare-cross-tenant",
        issue: {
          issueId: "action-issue-other",
          expectedRevision: 1,
          title: "Must stay hidden",
        },
      })
    ).rejects.toMatchObject({ code: "not_found" })
    const rejected = await first.internal.prepareUpdateIssue({
      grant: first.run.grant,
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
    const rejectedResponse = await app.handle(
      request(`/agent/actions/${rejected.id}/decision`, {
        method: "POST",
        body: decision,
      })
    )
    expect(rejectedResponse.status).toBe(200)
    expect(await rejectedResponse.json()).toMatchObject({ status: "rejected" })
    const repeated = await app.handle(
      request(`/agent/actions/${rejected.id}/decision`, {
        method: "POST",
        body: decision,
      })
    )
    expect(repeated.status).toBe(200)
    await expect(
      issueAgentActionResumeTicket(db, {
        actionId: rejected.id,
        sessionId: "action-session-a",
        userId: "action-user-a",
      })
    ).rejects.toMatchObject({ code: "conflict", statusCode: 409 })

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
      error: {
        code: "conflict",
        context: { reason: "idempotency_conflict" },
      },
    })
    const [issue] = await db
      .select({ revision: schema.issues.revision, title: schema.issues.title })
      .from(schema.issues)
      .where(eq(schema.issues.id, "action-issue-a"))
    expect(issue).toEqual({ revision: 1, title: "Original title" })
  })

  it("enforces full access scope and member delete ownership", async () => {
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
        issue: { issueId: "action-issue-a", expectedRevision: 2 },
      })
    ).rejects.toMatchObject({ code: "forbidden" })
  })

  it("preserves full access after Web search", async () => {
    const { app, db } = await createFixture()
    const actionRun = await createRun(db, {
      clientMessageId: "web-search-approval-fence",
    })
    const policy = await app.handle(
      request(`/agent/threads/${actionRun.thread.id}/permission`, {
        method: "PUT",
        body: { mode: "full_access" },
      })
    )
    expect(policy.status).toBe(200)

    const beforeSearch = await actionRun.internal.prepareUpdateIssue({
      grant: actionRun.run.grant,
      toolCallId: "tool-before-web-search",
      idempotencyKey: "prepare-before-web-search",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        priority: "high",
      },
    })
    expect(beforeSearch).toMatchObject({
      approvalMode: "full_access",
      requiresApproval: false,
      status: "approved",
    })
    await expect(
      actionRun.internal.executeApprovedAction({
        actionId: beforeSearch.id,
        grant: actionRun.run.grant,
      })
    ).resolves.toMatchObject({ issue: { revision: 2 } })

    await expect(
      actionRun.internal.reserveWebSearch({
        grant: actionRun.run.grant,
        operationId: "tool-public-web-search",
      })
    ).resolves.toEqual({ reserved: true, reused: false })

    const afterSearch = await actionRun.internal.prepareUpdateIssue({
      grant: actionRun.run.grant,
      toolCallId: "tool-after-web-search",
      idempotencyKey: "prepare-after-web-search",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 2,
        status: "closed",
      },
    })
    expect(afterSearch).toMatchObject({
      approvalMode: "full_access",
      requiresApproval: false,
      status: "approved",
    })
    await expect(
      getAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: actionRun.thread.id,
      })
    ).resolves.toMatchObject({ mode: "full_access" })
  })

  it("returns the current permission to ask always through the public route", async () => {
    const { app, db } = await createFixture()
    const { thread } = await createRun(db, {
      clientMessageId: "delete-policy-route",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
    })

    const response = await app.handle(
      request(`/agent/threads/${thread.id}/permission`, {
        method: "PUT",
        body: { mode: "ask_always" },
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.json()).toEqual({
      mode: "ask_always",
      permissions: {
        createIssue: false,
        updateIssue: false,
        deleteIssue: false,
      },
    })
    const [policy] = await db
      .select({ mode: schema.agentThreadPermissions.mode })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, thread.id))
    expect(policy).toEqual({ mode: "ask_always" })

    const invalid = await app.handle(
      request("/agent/threads/%20/permission", {
        method: "PUT",
        body: { mode: "ask_always" },
      })
    )
    expect(invalid.status).toBe(400)
  })

  it("revokes the scoped approval policy idempotently", async () => {
    const { db } = await createFixture()
    const { thread } = await createRun(db, {
      clientMessageId: "delete-policy-idempotent",
    })
    const policyNow = new Date()
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
      now: policyNow,
    })
    const firstRevokedAt = new Date(policyNow.getTime() + 1_000)
    const defaultPolicy = {
      mode: "ask_always" as const,
      permissions: {
        createIssue: false,
        updateIssue: false,
        deleteIssue: false,
      },
    }

    await expect(
      deleteAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: thread.id,
        now: firstRevokedAt,
      })
    ).resolves.toEqual(defaultPolicy)
    const afterFirst = await db
      .select({ id: schema.agentThreadPermissions.id })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, thread.id))
    expect(afterFirst).toEqual([])

    await expect(
      deleteAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: thread.id,
        now: new Date(firstRevokedAt.getTime() + 1_000),
      })
    ).resolves.toEqual(defaultPolicy)
    const afterRetry = await db
      .select({ id: schema.agentThreadPermissions.id })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, thread.id))
    expect(afterRetry).toEqual([])
  })

  it("does not revoke approval policies owned by another tenant or user", async () => {
    const { db } = await createFixture()
    const now = new Date()
    await db.insert(schema.session).values({
      id: "action-session-other-policy",
      userId: "action-user-a",
      token: "action-token-other-policy",
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "action-org-b",
    })
    const otherTenant = await createRun(db, {
      clientMessageId: "delete-policy-other-tenant",
      sessionId: "action-session-other-policy",
    })
    const otherOwner = await createRun(db, {
      clientMessageId: "delete-policy-other-owner",
      userId: "action-user-b",
      sessionId: "action-session-b",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-other-policy",
      userId: "action-user-a",
      threadId: otherTenant.thread.id,
      mode: "full_access",
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-b",
      userId: "action-user-b",
      threadId: otherOwner.thread.id,
      mode: "full_access",
    })

    await expect(
      deleteAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: otherTenant.thread.id,
      })
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 })
    await expect(
      deleteAgentApprovalPolicyForSession(db, {
        sessionId: "action-session-a",
        userId: "action-user-a",
        threadId: otherOwner.thread.id,
      })
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 })

    const [otherTenantPolicy] = await db
      .select({ mode: schema.agentThreadPermissions.mode })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, otherTenant.thread.id))
    const [otherOwnerPolicy] = await db
      .select({ mode: schema.agentThreadPermissions.mode })
      .from(schema.agentThreadPermissions)
      .where(eq(schema.agentThreadPermissions.threadId, otherOwner.thread.id))
    expect(otherTenantPolicy?.mode).toBe("full_access")
    expect(otherOwnerPolicy?.mode).toBe("full_access")
  })

  it("executes full_access delete through the same revision and audit boundary", async () => {
    const { app, db } = await createFixture()
    const actionRun = await createRun(db, { clientMessageId: "auto-delete" })
    const policy = await app.handle(
      request(`/agent/threads/${actionRun.thread.id}/permission`, {
        method: "PUT",
        body: { mode: "full_access" },
      })
    )
    expect(policy.status).toBe(200)
    const prepared = await actionRun.internal.prepareDeleteIssue({
      grant: actionRun.run.grant,
      toolCallId: "tool-auto-delete",
      idempotencyKey: "prepare-auto-delete",
      issue: { issueId: "action-issue-a", expectedRevision: 1 },
    })
    expect(prepared).toMatchObject({
      approvalMode: "full_access",
      status: "approved",
      preview: { destructive: true, issueNumber: 1 },
    })
    const result = await actionRun.internal.executeApprovedAction({
      grant: actionRun.run.grant,
      actionId: prepared.id,
    })
    expect(result).toMatchObject({
      issue: { deleted: true, id: "action-issue-a", revision: 1 },
      status: "succeeded",
    })
    expect(
      await db
        .select({ id: schema.issues.id })
        .from(schema.issues)
        .where(eq(schema.issues.id, "action-issue-a"))
    ).toEqual([])
    const audits = await db
      .select({ metadata: schema.auditLogs.metadata })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.targetId, "action-issue-a"))
    expect(audits).toEqual([
      {
        metadata: {
          actionId: prepared.id,
          approvalMode: "auto_policy",
          number: 1,
          source: "agent",
        },
      },
    ])
  })

  it("promotes a run-bound image without copying bytes and releases v2 storage on Issue delete", async () => {
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
    const connection = await internal.consumeConnectionTicket({
      ticket: ticket.ticket,
      threadId: thread.id,
    })
    const run = await internal.startRun({
      grant: connection.grant,
      clientMessageId: "attachment-create",
      assetIds: [assetId],
    })
    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
    })
    const createAction = await internal.prepareCreateIssue({
      grant: run.grant,
      toolCallId: "tool-create-with-image",
      idempotencyKey: "prepare-create-with-image",
      issue: {
        title: "Issue from screenshot",
        description: "Generated image description",
        labels: ["Visual"],
        attachmentAssetIds: [assetId],
      },
    })
    expect(createAction.preview?.attachments).toEqual([
      { assetId, filename: "screenshot.png", sizeBytes: 128 },
    ])
    await expect(
      internal.prepareCreateIssue({
        grant: run.grant,
        toolCallId: "tool-create-with-leased-image",
        idempotencyKey: "prepare-create-with-leased-image",
        issue: {
          title: "Second issue from screenshot",
          attachmentAssetIds: [assetId],
        },
      })
    ).rejects.toMatchObject({
      code: "conflict",
      statusCode: 409,
      publicContext: {
        reason: "asset_lease_conflict",
        resource: "agent_asset",
      },
    })
    const created = await internal.executeApprovedAction({
      grant: run.grant,
      actionId: createAction.id,
    })
    const [file] = await db
      .select()
      .from(schema.files)
      .where(eq(schema.files.storageObjectId, storageObjectId))
    expect(file).toMatchObject({
      filename: "screenshot.png",
      objectKey,
      status: "ready",
    })
    const [promotedAsset] = await db
      .select()
      .from(schema.agentAssets)
      .where(eq(schema.agentAssets.id, assetId))
    expect(promotedAsset).toMatchObject({
      promotedFileId: file?.id,
      status: "promoted",
      storageObjectId: null,
    })
    const [promotedClaim] = await db
      .select()
      .from(schema.storageObjectClaims)
      .where(eq(schema.storageObjectClaims.storageObjectId, storageObjectId))
    expect(promotedClaim).toMatchObject({
      holderId: file?.id,
      holderType: "file",
      revision: 3,
    })
    const promotedPreview = await findPreviewableAgentAssetForSession(db, {
      assetId,
      organizationId: "action-org-a",
      sessionId: "action-session-a",
      userId: "action-user-a",
      now,
    })
    expect(promotedPreview).toMatchObject({
      asset: { id: assetId, status: "promoted" },
      storage: { id: storageObjectId, status: "ready" },
      claim: { holderId: file?.id, holderType: "file" },
    })
    await expect(
      findPreviewableAgentAssetForSession(db, {
        assetId,
        organizationId: "action-org-a",
        sessionId: "action-session-b",
        userId: "action-user-b",
        now,
      })
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 })
    const [promotedUsage] = await db
      .select()
      .from(schema.organizationFileUsage)
      .where(eq(schema.organizationFileUsage.organizationId, "action-org-a"))
    expect(promotedUsage).toMatchObject({ usedBytes: 128, temporaryBytes: 0 })

    await putAgentApprovalPolicyForSession(db, {
      sessionId: "action-session-a",
      userId: "action-user-a",
      threadId: thread.id,
      mode: "full_access",
    })
    const deleteAction = await internal.prepareDeleteIssue({
      grant: run.grant,
      toolCallId: "tool-delete-with-image",
      idempotencyKey: "prepare-delete-with-image",
      issue: { issueId: created.issue.id, expectedRevision: 1 },
    })
    await internal.executeApprovedAction({
      grant: run.grant,
      actionId: deleteAction.id,
    })
    expect(
      await db
        .select()
        .from(schema.storageObjectClaims)
        .where(eq(schema.storageObjectClaims.storageObjectId, storageObjectId))
    ).toEqual([])
    const [releasedStorage] = await db
      .select()
      .from(schema.storageObjects)
      .where(eq(schema.storageObjects.id, storageObjectId))
    expect(releasedStorage).toMatchObject({
      cleanupRevision: 1,
      objectKey,
      status: "deleting",
    })
    expect(
      await db
        .select()
        .from(schema.storageObjectCleanupJobs)
        .where(
          eq(schema.storageObjectCleanupJobs.storageObjectId, storageObjectId)
        )
    ).toHaveLength(1)
    const [releasedUsage] = await db
      .select()
      .from(schema.organizationFileUsage)
      .where(eq(schema.organizationFileUsage.organizationId, "action-org-a"))
    expect(releasedUsage).toMatchObject({ usedBytes: 0, temporaryBytes: 0 })
  })

  it("counts idempotent preparations once and enforces the root write limit", async () => {
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
        // oxlint-disable-next-line no-await-in-loop -- root counterの順序と境界を検証する。
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
      publicContext: { reason: "write_limit_reached" },
    })
    const [root] = await db
      .select({ writeCount: schema.agentRuns.writeCount })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, actionRun.run.rootRunId))
    expect(root?.writeCount).toBe(5)
  })

  it("rolls back a transient execute failure and retries the same action exactly once", async () => {
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
    await expect(
      internal.executeApprovedAction({
        grant: run.grant,
        actionId: prepared.id,
      })
    ).rejects.toMatchObject({ code: "internal_error" })
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

  it("revokes approved actions, policies, resume tickets, and leases on organization switch", async () => {
    const { app, db } = await createFixture()
    const { connection, internal, run, thread } = await createRun(db, {
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
    expect(grants).toHaveLength(2)
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
      internal.consumeConnectionTicket({
        ticket: unusedTicket.ticket,
        threadId: thread.id,
      })
    ).rejects.toMatchObject({ code: "unauthorized" })
    await expect(
      internal.startRun({
        grant: connection.grant,
        clientMessageId: "switch-replay",
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

  it("rotates the Agent context when creating and activating a replacement organization", async () => {
    const { db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "create-replacement-organization",
    })
    const [contextBefore] = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "action-session-a"))

    const created = await insertOrganizationWithSuperAdmin(db, {
      activate: true,
      name: "Replacement Organization",
      sessionId: "action-session-a",
      slug: `replacement-${crypto.randomUUID()}`,
      userId: "action-user-a",
    })

    const [currentSession] = await db
      .select({
        activeOrganizationId: schema.session.activeOrganizationId,
      })
      .from(schema.session)
      .where(eq(schema.session.id, "action-session-a"))
    const [contextAfter] = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "action-session-a"))
    expect(currentSession?.activeOrganizationId).toBe(created.id)
    expect(contextAfter?.contextEpoch).toBe(
      (contextBefore?.contextEpoch ?? 0) + 1
    )
    await expect(
      internal.readActiveOrganization({ grant: run.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })

  it("expires a resume ticket atomically and permits only one parallel consumer", async () => {
    const { app, db } = await createFixture()
    const { internal, run } = await createRun(db, {
      clientMessageId: "resume-race",
    })
    const prepared = await internal.prepareUpdateIssue({
      grant: run.grant,
      toolCallId: "tool-resume-race",
      idempotencyKey: "prepare-resume-race",
      issue: {
        issueId: "action-issue-a",
        expectedRevision: 1,
        status: "in_progress",
      },
    })
    await app.handle(
      request(`/agent/actions/${prepared.id}/decision`, {
        method: "POST",
        body: {
          decision: "yes",
          idempotencyKey: "decision-resume-race",
        },
      })
    )
    const issuedAt = new Date()
    const expired = await issueAgentActionResumeTicket(db, {
      actionId: prepared.id,
      sessionId: "action-session-a",
      userId: "action-user-a",
      now: issuedAt,
    })
    await expect(
      resumeAgentApprovedAction(db, {
        actionId: prepared.id,
        resumeTicket: expired.ticket,
        now: new Date(issuedAt.getTime() + 60_001),
      })
    ).rejects.toMatchObject({ code: "unauthorized" })

    const fresh = await issueAgentActionResumeTicket(db, {
      actionId: prepared.id,
      sessionId: "action-session-a",
      userId: "action-user-a",
    })
    const results = await Promise.allSettled([
      resumeAgentApprovedAction(db, {
        actionId: prepared.id,
        resumeTicket: fresh.ticket,
      }),
      resumeAgentApprovedAction(db, {
        actionId: prepared.id,
        resumeTicket: fresh.ticket,
      }),
    ])
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    )
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    )
  })
})
