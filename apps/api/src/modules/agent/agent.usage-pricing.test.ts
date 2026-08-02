import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createFixture } from "./agent.test-support"
import { createAgentInternalApi } from "./module"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

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
    const connection = await internal.consumeConnectionTicket({
      threadId: thread.id,
      ticket: ticket.ticket,
    })
    const run = await internal.startRun({
      clientMessageId: "luna-usage-message",
      grant: connection.grant,
    })

    await expect(
      internal.recordUsage({
        grant: run.grant,
        provider: "openrouter",
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
      })
    ).resolves.toEqual({
      recorded: true,
      calculatedCostMicros: 307,
      pricingVersion: "openai-2026-08-01",
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
      .select({ costMicros: schema.agentUsageDaily.costMicros })
      .from(schema.agentUsageDaily)
      .where(eq(schema.agentUsageDaily.model, "openai/gpt-5.6-luna"))
    expect(daily).toEqual({ costMicros: 999 })
  })
})
