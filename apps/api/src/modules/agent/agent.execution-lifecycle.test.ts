import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createFixture } from "./agent.test-support"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

const createConnection = async (
  db: Awaited<ReturnType<typeof createFixture>>["db"],
  threadId: string
) => {
  const internal = createAgentInternalApi(db)
  const ticket = await issueAgentConnectionTicket(db, {
    sessionId: "agent-session-a",
    threadId,
    userId: "agent-user-a",
  })
  return internal.consumeConnectionTicket({ threadId, ticket: ticket.ticket })
}

describe("Agent ticket and execution lifecycle", () => {
  it("atomically permits one ticket consumer and one connection grant", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Concurrent ticket",
      userId: "agent-user-a",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    const internal = createAgentInternalApi(db)

    const results = await Promise.allSettled([
      internal.consumeConnectionTicket({
        threadId: thread.id,
        ticket: ticket.ticket,
      }),
      internal.consumeConnectionTicket({
        threadId: thread.id,
        ticket: ticket.ticket,
      }),
    ])

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    )
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    )
    const grants = await db
      .select({ id: schema.agentGrants.id })
      .from(schema.agentGrants)
      .where(eq(schema.agentGrants.kind, "connection"))
    expect(grants).toHaveLength(1)
  })

  it("creates one execution lease for concurrent starts of one message", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Concurrent run",
      userId: "agent-user-a",
    })
    const first = await createConnection(db, thread.id)
    const second = await createConnection(db, thread.id)
    const internal = createAgentInternalApi(db)
    const startInput = {
      assetIds: [],
      clientMessageId: "message_concurrent",
      estimatedInputTokenCount: 10,
      trigger: "user_message" as const,
    }

    const results = await Promise.allSettled([
      internal.startRun({ ...startInput, grant: first.grant }),
      internal.startRun({ ...startInput, grant: second.grant }),
    ])

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    )
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    )
    const runs = await db
      .select({
        attempt: schema.agentRuns.attempt,
        id: schema.agentRuns.id,
      })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.clientMessageId, "message_concurrent"))
    expect(runs).toEqual([{ attempt: 1, id: expect.any(String) }])
  })

  it("retries a failed logical run with a fresh attempt and grant", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Retry run",
      userId: "agent-user-a",
    })
    const internal = createAgentInternalApi(db)
    const firstConnection = await createConnection(db, thread.id)
    const first = await internal.startRun({
      assetIds: [],
      clientMessageId: "message_retry",
      estimatedInputTokenCount: 10,
      grant: firstConnection.grant,
      trigger: "user_message",
    })
    await internal.finishRun({ grant: first.grant, outcome: "failed" })

    const nextConnection = await createConnection(db, thread.id)
    const retry = await internal.startRun({
      assetIds: [],
      clientMessageId: "message_retry",
      estimatedInputTokenCount: 10,
      grant: nextConnection.grant,
      trigger: "user_message",
    })

    expect(retry).toMatchObject({ attempt: 2, runId: first.runId })
    expect(retry.grant).not.toBe(first.grant)
    await expect(
      internal.readAccountContext({ grant: first.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
    await expect(
      internal.readAccountContext({ grant: retry.grant })
    ).resolves.toMatchObject({ name: "Agent User A" })
    const activeRunGrants = await db
      .select({ tokenHash: schema.agentGrants.tokenHash })
      .from(schema.agentGrants)
      .where(eq(schema.agentGrants.kind, "run"))
    expect(activeRunGrants).toHaveLength(2)
    expect(
      new Set(activeRunGrants.map(({ tokenHash }) => tokenHash)).size
    ).toBe(2)
  })
})
