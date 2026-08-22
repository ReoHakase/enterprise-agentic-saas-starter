import * as schema from "@enterprise-agentic-saas/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"

import { createFixture, request } from "./agent.test-support"
import { createAgentInternalApi } from "./module"
import { configureAgentRuntime } from "./runtime"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

describe("public Agent run cancellation", () => {
  it("commits cancellation without cross-request runtime I/O", async () => {
    const { app, db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Request signal cancellation",
      userId: "agent-user-a",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    const internal = createAgentInternalApi(db)
    const chatRun = await internal.startChatRun({
      clientMessageId: "request-signal-cancel",
      threadId: thread.id,
      ticket: ticket.ticket,
    })
    const run = chatRun.run
    const action = await internal.prepareCreateIssue({
      grant: run.grant,
      toolCallId: "tool-request-signal-cancel",
      idempotencyKey: "prepare-request-signal-cancel",
      issue: { title: "Canceled before execution" },
    })
    expect(action.status).toBe("pending")

    const runtimeFetch = vi.fn<() => Promise<Response>>(() =>
      Promise.reject(new Error("Runtime cancel endpoint must not be called"))
    )
    configureAgentRuntime({ fetch: runtimeFetch })

    const response = await app.handle(
      request(`/agent/threads/${thread.id}/runs/${run.runId}/cancel`, {
        method: "POST",
      })
    )

    expect(response.status).toBe(200)
    expect(runtimeFetch).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      runId: run.runId,
      status: "canceled",
    })
    const [storedRun] = await db
      .select({ status: schema.agentRuns.status })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, run.runId))
    expect(storedRun).toEqual({ status: "canceled" })
    const [storedAction] = await db
      .select({ status: schema.agentActions.status })
      .from(schema.agentActions)
      .where(eq(schema.agentActions.id, action.id))
    expect(storedAction).toEqual({ status: "canceled" })
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

    const nextTicket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    await expect(
      internal.startChatRun({
        clientMessageId: "after-request-signal-cancel",
        threadId: thread.id,
        ticket: nextTicket.ticket,
      })
    ).resolves.toMatchObject({ run: { attempt: 1 } })
  })

  it("converges a real finish-versus-cancel race to one terminal status and one usage event", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Finish cancel race",
      userId: "agent-user-a",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    const internal = createAgentInternalApi(db)
    const chatRun = await internal.startChatRun({
      clientMessageId: "finish-cancel-race",
      threadId: thread.id,
      ticket: ticket.ticket,
    })
    const run = chatRun.run
    const usage = {
      provider: "openrouter" as const,
      model: "test/model",
      inputTokenCount: 10,
      inputNoCacheTokenCount: 10,
      cacheReadTokenCount: 0,
      cacheWriteTokenCount: 0,
      outputTokenCount: 5,
      textOutputTokenCount: 5,
      reasoningTokenCount: 0,
      totalTokenCount: 15,
      imageInputCount: 0,
      durationMs: 100,
      runEventId: "race_attempt_1",
    }
    const results = await Promise.allSettled([
      internal.finalizeRun({
        grant: run.grant,
        outcome: "completed",
        usage,
      }),
      internal.finalizeRun({ grant: run.grant, outcome: "canceled" }),
    ])

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1)
    const [stored] = await db
      .select({ status: schema.agentRuns.status })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, run.runId))
    expect(["completed", "canceled"]).toContain(stored?.status)
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

    const usageEvents = await db
      .select({ id: schema.agentUsageEvents.id })
      .from(schema.agentUsageEvents)
      .where(eq(schema.agentUsageEvents.runId, run.runId))
    expect(usageEvents).toHaveLength(1)
  })

  it("never downgrades completed or failed runs and replays canceled runs", async () => {
    const { app, db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Terminal cancel race",
      userId: "agent-user-a",
    })
    const internal = createAgentInternalApi(db)
    const start = async (clientMessageId: string) => {
      const ticket = await issueAgentConnectionTicket(db, {
        sessionId: "agent-session-a",
        threadId: thread.id,
        userId: "agent-user-a",
      })
      const chatRun = await internal.startChatRun({
        clientMessageId,
        threadId: thread.id,
        ticket: ticket.ticket,
      })
      return chatRun.run
    }

    for (const outcome of ["completed", "failed"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- each terminal status needs an independent capability lifecycle.
      const run = await start(`terminal-${outcome}`)
      // oxlint-disable-next-line no-await-in-loop -- each terminal status needs an independent capability lifecycle.
      await internal.finalizeRun({ grant: run.grant, outcome })
      // oxlint-disable-next-line no-await-in-loop -- the public replay must observe the committed terminal status.
      const response = await app.handle(
        request(`/agent/threads/${thread.id}/runs/${run.runId}/cancel`, {
          method: "POST",
        })
      )
      // oxlint-disable-next-line no-await-in-loop -- response bodies are consumed per terminal replay.
      await expect(response.json()).resolves.toEqual({
        runId: run.runId,
        status: outcome,
      })
      // oxlint-disable-next-line no-await-in-loop -- a different internal terminal transition must conflict.
      await expect(
        internal.finalizeRun({ grant: run.grant, outcome: "canceled" })
      ).rejects.toMatchObject({ code: "conflict" })
      // oxlint-disable-next-line no-await-in-loop -- verify the cancel request did not downgrade the row.
      const [stored] = await db
        .select({ status: schema.agentRuns.status })
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, run.runId))
      expect(stored?.status).toBe(outcome)
    }

    const canceled = await start("terminal-canceled")
    await expect(
      internal.finalizeRun({ grant: canceled.grant, outcome: "canceled" })
    ).resolves.toEqual({
      runId: canceled.runId,
      status: "canceled",
    })
    await expect(
      internal.finalizeRun({ grant: canceled.grant, outcome: "canceled" })
    ).resolves.toEqual({
      runId: canceled.runId,
      status: "canceled",
    })
    const replay = await app.handle(
      request(`/agent/threads/${thread.id}/runs/${canceled.runId}/cancel`, {
        method: "POST",
      })
    )
    expect(await replay.json()).toEqual({
      runId: canceled.runId,
      status: "canceled",
    })
  })

  it("authorizes ownership, converges idempotently, and does not refund usage", async () => {
    const { app, db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Cancel",
      userId: "agent-user-a",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    const internal = createAgentInternalApi(db)
    const chatRun = await internal.startChatRun({
      clientMessageId: "cancel_message_1",
      threadId: thread.id,
      ticket: ticket.ticket,
    })
    const run = chatRun.run
    const path = `/agent/threads/${thread.id}/runs/${run.runId}/cancel`

    const denied = await app.handle(
      request(path, {
        method: "POST",
        sessionId: "agent-session-b",
        userId: "agent-user-b",
      })
    )
    expect(denied.status).toBe(404)

    const first = await app.handle(request(path, { method: "POST" }))
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      runId: run.runId,
      status: "canceled",
    })
    const repeated = await app.handle(request(path, { method: "POST" }))
    expect(await repeated.json()).toEqual({
      runId: run.runId,
      status: "canceled",
    })

    const [storedRun] = await db
      .select({ status: schema.agentRuns.status })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, run.runId))
    expect(storedRun).toEqual({ status: "canceled" })
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
    const modelBuckets = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "model_run"))
    expect(modelBuckets).toEqual([{ count: 1 }, { count: 1 }])

    const nextTicket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    await expect(
      internal.startChatRun({
        clientMessageId: "cancel_message_2",
        threadId: thread.id,
        ticket: nextTicket.ticket,
      })
    ).resolves.toMatchObject({ run: { attempt: 1 } })
  })
})
