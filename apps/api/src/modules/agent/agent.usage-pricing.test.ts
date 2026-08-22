import * as schema from "@enterprise-agentic-saas/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createFixture } from "./agent.test-support"
import { createAgentInternalApi } from "./module"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

const MINIMAL_USAGE = {
  provider: "openrouter",
  model: "openai/gpt-5.6-luna",
  inputTokenCount: 1,
  inputNoCacheTokenCount: 1,
  cacheReadTokenCount: 0,
  cacheWriteTokenCount: 0,
  outputTokenCount: 1,
  textOutputTokenCount: 1,
  reasoningTokenCount: 0,
  totalTokenCount: 2,
  imageInputCount: 0,
  durationMs: 1,
  runEventId: "attempt_1",
} as const

describe("Agent Luna usage pricing", () => {
  it("records the fallback calculation but prioritizes provider cost internally", async () => {
    const { db } = await createFixture()
    const internal = createAgentInternalApi(db)
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Luna usage",
      userId: "agent-user-a",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    const chatRun = await internal.startChatRun({
      clientMessageId: "luna-usage-message",
      threadId: thread.id,
      ticket: ticket.ticket,
    })
    const run = chatRun.run

    const finalization = {
      grant: run.grant,
      outcome: "completed" as const,
      usage: {
        provider: "openrouter" as const,
        model: "openai/gpt-5.6-luna",
        inputTokenCount: 1_000,
        inputNoCacheTokenCount: 800,
        cacheReadTokenCount: 100,
        cacheWriteTokenCount: 100,
        outputTokenCount: 100,
        textOutputTokenCount: 20,
        reasoningTokenCount: 80,
        totalTokenCount: 1_100,
        imageInputCount: 0,
        providerCostMicros: 999,
        durationMs: 100,
        runEventId: "attempt_1",
      },
    }
    await expect(internal.finalizeRun(finalization)).resolves.toEqual({
      runId: run.runId,
      status: "completed",
    })
    await expect(internal.finalizeRun(finalization)).resolves.toEqual({
      runId: run.runId,
      status: "completed",
    })

    const [event] = await db
      .select({
        calculatedCostMicros: schema.agentUsageEvents.calculatedCostMicros,
        isEstimate: schema.agentUsageEvents.isEstimate,
        providerCostMicros: schema.agentUsageEvents.providerCostMicros,
      })
      .from(schema.agentUsageEvents)
      .where(eq(schema.agentUsageEvents.runId, run.runId))
    expect(event).toEqual({
      calculatedCostMicros: 307,
      isEstimate: false,
      providerCostMicros: 999,
    })
    const [daily] = await db
      .select({
        costMicros: schema.agentUsageDaily.costMicros,
        runCount: schema.agentUsageDaily.runCount,
      })
      .from(schema.agentUsageDaily)
      .where(eq(schema.agentUsageDaily.model, "openai/gpt-5.6-luna"))
    expect(daily).toEqual({ costMicros: 999, runCount: 1 })
    const liveRunGrants = await db
      .select({ id: schema.agentGrants.id })
      .from(schema.agentGrants)
      .where(
        and(
          eq(schema.agentGrants.runId, run.runId),
          isNull(schema.agentGrants.revokedAt)
        )
      )
    expect(liveRunGrants).toEqual([])
  })

  it("settles the run even when usage persistence fails", async () => {
    const { db } = await createFixture()
    const internal = createAgentInternalApi(db)
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Usage write failure",
      userId: "agent-user-a",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    const { run } = await internal.startChatRun({
      clientMessageId: "usage-failure-message",
      threadId: thread.id,
      ticket: ticket.ticket,
    })
    await db.run(sql`
      create trigger fail_agent_usage_insert
      before insert on agent_usage_events
      begin
        select raise(abort, 'private_usage_failure');
      end
    `)

    await expect(
      internal.finalizeRun({
        grant: run.grant,
        outcome: "completed",
        usage: MINIMAL_USAGE,
      })
    ).rejects.toMatchObject({ message: "Agent usage finalization failed" })
    await expect(
      db
        .select({ status: schema.agentRuns.status })
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, run.runId))
    ).resolves.toEqual([{ status: "completed" }])
  })

  it("preserves an approval wait when usage persistence fails", async () => {
    const { db } = await createFixture()
    const internal = createAgentInternalApi(db)
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Approval usage failure",
      userId: "agent-user-a",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    const { run } = await internal.startChatRun({
      clientMessageId: "approval-usage-failure-message",
      threadId: thread.id,
      ticket: ticket.ticket,
    })
    await db
      .update(schema.agentRuns)
      .set({ status: "waiting_approval" })
      .where(eq(schema.agentRuns.id, run.runId))
    await db.run(sql`
      create trigger fail_agent_usage_insert
      before insert on agent_usage_events
      begin
        select raise(abort, 'private_usage_failure');
      end
    `)

    await expect(
      internal.finalizeRun({
        grant: run.grant,
        outcome: "waiting_approval",
        usage: MINIMAL_USAGE,
      })
    ).rejects.toMatchObject({ message: "Agent usage finalization failed" })
    await expect(
      db
        .select({ status: schema.agentRuns.status })
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, run.runId))
    ).resolves.toEqual([{ status: "waiting_approval" }])
  })
})
