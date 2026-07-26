import * as schema from "@enterprise-agentic-saas/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { createFixture, request } from "./agent.test-support"
import { createAgentInternalApi } from "./internal-api"
import { agentThreadModel } from "./model"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

describe("Agent ticket and execution lifecycle", () => {
  it("binds a hashed one-time ticket to its expected thread", async () => {
    const { db } = await createFixture()
    const firstThread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "First thread",
    })
    const secondThread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Second thread",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: firstThread.id,
    })
    const persisted = await db
      .select({ tokenHash: schema.agentConnectionTickets.tokenHash })
      .from(schema.agentConnectionTickets)
      .limit(1)
    expect(persisted[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(persisted[0]?.tokenHash).not.toBe(ticket.ticket)

    const internal = createAgentInternalApi(db)
    await expect(
      internal.consumeConnectionTicket({
        ticket: ticket.ticket,
        threadId: secondThread.id,
      })
    ).rejects.toMatchObject({ code: "unauthorized" })

    const connection = await internal.consumeConnectionTicket({
      ticket: ticket.ticket,
      threadId: firstThread.id,
    })
    expect(connection).toMatchObject({
      thread: { id: firstThread.id },
      user: { name: "Agent User A" },
      organization: { slug: "agent-org-a" },
    })
    expect(connection.grant).not.toBe(persisted[0]?.tokenHash)
  })

  it("atomically allows exactly one parallel ticket consumer", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Parallel consume",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const internal = createAgentInternalApi(db)

    const results = await Promise.allSettled([
      internal.consumeConnectionTicket({
        ticket: ticket.ticket,
        threadId: thread.id,
      }),
      internal.consumeConnectionTicket({
        ticket: ticket.ticket,
        threadId: thread.id,
      }),
    ])
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    )
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    )
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({
      reason: { code: "unauthorized" },
      status: "rejected",
    })

    const tickets = await db
      .select({ consumedAt: schema.agentConnectionTickets.consumedAt })
      .from(schema.agentConnectionTickets)
    expect(tickets).toHaveLength(1)
    expect(tickets[0]?.consumedAt).toBeInstanceOf(Date)
    const grants = await db
      .select({ id: schema.agentGrants.id })
      .from(schema.agentGrants)
      .where(eq(schema.agentGrants.kind, "connection"))
    expect(grants).toHaveLength(1)
  })

  it("creates exactly one execution lease for parallel starts of one logical message", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Parallel logical run",
    })
    const internal = createAgentInternalApi(db)
    const createConnection = async () => {
      const ticket = await issueAgentConnectionTicket(db, {
        sessionId: "agent-session-a",
        userId: "agent-user-a",
        threadId: thread.id,
      })
      return internal.consumeConnectionTicket({
        ticket: ticket.ticket,
        threadId: thread.id,
      })
    }
    const [firstConnection, secondConnection] = await Promise.all([
      createConnection(),
      createConnection(),
    ])

    const starts = await Promise.allSettled([
      internal.startRun({
        grant: firstConnection.grant,
        clientMessageId: "message-parallel-logical-run",
      }),
      internal.startRun({
        grant: secondConnection.grant,
        clientMessageId: "message-parallel-logical-run",
      }),
    ])

    expect(starts.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    )
    expect(starts.filter(({ status }) => status === "rejected")).toHaveLength(1)
    expect(starts.find(({ status }) => status === "rejected")).toMatchObject({
      reason: {
        code: "conflict",
        publicContext: { reason: "run_in_progress" },
      },
      status: "rejected",
    })
    const runs = await db
      .select({ attempt: schema.agentRuns.attempt, id: schema.agentRuns.id })
      .from(schema.agentRuns)
      .where(
        eq(schema.agentRuns.clientMessageId, "message-parallel-logical-run")
      )
    expect(runs).toEqual([{ attempt: 1, id: expect.any(String) }])
    const runGrants = await db
      .select({ id: schema.agentGrants.id })
      .from(schema.agentGrants)
      .where(eq(schema.agentGrants.kind, "run"))
    expect(runGrants).toHaveLength(1)
  })

  it("renames an untitled thread once and projects one idempotent priced usage event", async () => {
    const { app, db } = await createFixture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadModel, await createdResponse.json())
    expect(thread).toMatchObject({
      title: "New conversation",
      messageCount: 0,
    })
    await db.insert(schema.agentMessages).values({
      id: "current-search-message",
      organizationId: "agent-org-a",
      threadId: thread.id,
      clientMessageId: "message-title-and-usage",
      role: "user",
      content: {
        parts: [
          {
            type: "text",
            text: "Public-only Web query: current approaches to prioritizing software defects",
          },
        ],
      },
      createdAt: new Date(),
    })

    const internal = createAgentInternalApi(db)
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const connection = await internal.consumeConnectionTicket({
      ticket: ticket.ticket,
      threadId: thread.id,
    })
    const run = await internal.startRun({
      grant: connection.grant,
      clientMessageId: "message-title-and-usage",
    })
    expect(run.shouldGenerateTitle).toBe(true)

    await expect(
      internal.guardWebSearch({
        grant: run.grant,
        query: "current approaches to prioritizing software defects",
      })
    ).resolves.toEqual({
      query: "current approaches to prioritizing software defects",
    })
    await expect(
      internal.guardWebSearch({
        grant: run.grant,
        query: "Agent User B software work",
      })
    ).rejects.toMatchObject({
      code: "validation_error",
      publicMessage: "Web search query is not public",
    })
    await expect(
      internal.renameThread({
        grant: run.grant,
        title: "Prioritize urgent API work",
      })
    ).resolves.toEqual({
      threadId: thread.id,
      title: "Prioritize urgent API work",
      renamed: true,
    })
    await expect(
      internal.renameThread({
        grant: run.grant,
        title: "A second title must not win",
      })
    ).resolves.toEqual({
      threadId: thread.id,
      title: "Prioritize urgent API work",
      renamed: false,
    })

    const usage = {
      grant: run.grant,
      provider: "openrouter" as const,
      model: "qwen/qwen3.6-flash",
      inputTokenCount: 100,
      inputNoCacheTokenCount: 80,
      cacheReadTokenCount: 20,
      cacheWriteTokenCount: 0,
      outputTokenCount: 50,
      textOutputTokenCount: 30,
      reasoningTokenCount: 20,
      totalTokenCount: 150,
      imageInputCount: 0,
      durationMs: 1_000,
      runEventId: "usage-title-and-usage",
    }
    const first = await internal.recordUsage(usage)
    const repeated = await internal.recordUsage(usage)
    expect(first).toMatchObject({
      recorded: true,
      pricingVersion: "openrouter-alibaba-tiered-2026-07-23",
    })
    expect(first.calculatedCostMicros).toBe(73)
    expect(repeated).toEqual({ ...first, recorded: false })
    const tiered = await internal.recordUsage({
      ...usage,
      inputTokenCount: 300_000,
      inputNoCacheTokenCount: 250_000,
      cacheReadTokenCount: 50_000,
      outputTokenCount: 1_000,
      textOutputTokenCount: 500,
      reasoningTokenCount: 500,
      totalTokenCount: 301_000,
      runEventId: "usage-tiered-price",
    })
    expect(tiered).toEqual({
      recorded: true,
      calculatedCostMicros: 194_250,
      pricingVersion: "openrouter-alibaba-tiered-2026-07-23",
    })

    const events = await db
      .select()
      .from(schema.agentUsageEvents)
      .where(eq(schema.agentUsageEvents.runEventId, usage.runEventId))
    const daily = await db
      .select()
      .from(schema.agentUsageDaily)
      .where(eq(schema.agentUsageDaily.organizationId, "agent-org-a"))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      userId: "agent-user-a",
      reasoningTokenCount: 20,
      totalTokenCount: 150,
    })
    expect(daily).toHaveLength(1)
    expect(daily[0]).toMatchObject({ runCount: 2, totalTokenCount: 301_150 })

    await internal.finishRun({ grant: run.grant, outcome: "completed" })
    const nextTicket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const nextConnection = await internal.consumeConnectionTicket({
      ticket: nextTicket.ticket,
      threadId: thread.id,
    })
    const nextRun = await internal.startRun({
      grant: nextConnection.grant,
      clientMessageId: "message-title-already-set",
    })
    expect(nextRun.shouldGenerateTitle).toBe(false)
  })

  it("renames a thread manually with revision CAS and protects the user title", async () => {
    const { app, db } = await createFixture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadModel, await createdResponse.json())

    const renamedResponse = await app.handle(
      request(`/agent/threads/${thread.id}/title`, {
        method: "PATCH",
        body: { title: "手動で決めた調査thread", expectedRevision: 1 },
      })
    )
    expect(renamedResponse.status).toBe(200)
    expect(await renamedResponse.json()).toMatchObject({
      id: thread.id,
      title: "手動で決めた調査thread",
      titleRevision: 2,
    })

    const staleResponse = await app.handle(
      request(`/agent/threads/${thread.id}/title`, {
        method: "PATCH",
        body: { title: "古いrevisionからの上書き", expectedRevision: 1 },
      })
    )
    expect(staleResponse.status).toBe(409)

    const otherOwnerResponse = await app.handle(
      request(`/agent/threads/${thread.id}/title`, {
        method: "PATCH",
        body: { title: "別userからの上書き", expectedRevision: 2 },
        userId: "agent-user-b",
        sessionId: "agent-session-b",
      })
    )
    expect(otherOwnerResponse.status).toBe(404)

    const internal = createAgentInternalApi(db)
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const connection = await internal.consumeConnectionTicket({
      ticket: ticket.ticket,
      threadId: thread.id,
    })
    const run = await internal.startRun({
      grant: connection.grant,
      clientMessageId: "message-manual-title-wins",
    })
    expect(run.shouldGenerateTitle).toBe(false)
    await expect(
      internal.renameThread({
        grant: run.grant,
        title: "自動titleで上書きしてはいけない",
      })
    ).resolves.toEqual({
      threadId: thread.id,
      title: "手動で決めた調査thread",
      renamed: false,
    })

    const [stored] = await db
      .select({
        title: schema.agentThreads.title,
        titleRevision: schema.agentThreads.titleRevision,
        titleState: schema.agentThreads.titleState,
      })
      .from(schema.agentThreads)
      .where(eq(schema.agentThreads.id, thread.id))
    expect(stored).toEqual({
      title: "手動で決めた調査thread",
      titleRevision: 2,
      titleState: "user",
    })
  })

  it("retries one failed logical run with a new attempt and one fresh grant", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Retry logical run",
    })
    const internal = createAgentInternalApi(db)
    const createConnection = async () => {
      const ticket = await issueAgentConnectionTicket(db, {
        sessionId: "agent-session-a",
        userId: "agent-user-a",
        threadId: thread.id,
      })
      return internal.consumeConnectionTicket({
        ticket: ticket.ticket,
        threadId: thread.id,
      })
    }
    const firstConnection = await createConnection()
    const first = await internal.startRun({
      grant: firstConnection.grant,
      clientMessageId: "message-retry-logical-run",
    })
    expect(first.attempt).toBe(1)
    await internal.finishRun({ grant: first.grant, outcome: "failed" })

    const retryConnection = await createConnection()
    const retried = await internal.startRun({
      grant: retryConnection.grant,
      clientMessageId: "message-retry-logical-run",
    })
    expect(retried).toMatchObject({
      attempt: 2,
      rootRunId: first.rootRunId,
      runId: first.runId,
    })
    expect(retried.grant).not.toBe(first.grant)

    const runs = await db
      .select({
        attempt: schema.agentRuns.attempt,
        id: schema.agentRuns.id,
        status: schema.agentRuns.status,
      })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.clientMessageId, "message-retry-logical-run"))
    expect(runs).toEqual([{ attempt: 2, id: first.runId, status: "running" }])
    const activeRunGrants = await db
      .select({ id: schema.agentGrants.id })
      .from(schema.agentGrants)
      .where(
        and(
          eq(schema.agentGrants.runId, first.runId),
          eq(schema.agentGrants.kind, "run"),
          isNull(schema.agentGrants.revokedAt)
        )
      )
    expect(activeRunGrants).toHaveLength(1)
    await expect(
      internal.startRun({
        grant: retryConnection.grant,
        clientMessageId: "message-reused-connection-grant",
      })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })
})
