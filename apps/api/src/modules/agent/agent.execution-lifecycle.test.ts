import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createFixture } from "./agent.test-support"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"
import {
  AGENT_MODEL_RUN_USER_HOURLY_LIMIT,
  AGENT_USAGE_HOUR_MS,
  consumeAgentResourceLimitInTransaction,
  utcUsageWindow,
} from "./usage/resource-limits"

const issueTicket = async (
  db: Awaited<ReturnType<typeof createFixture>>["db"],
  threadId: string
) =>
  issueAgentConnectionTicket(db, {
    sessionId: "agent-session-a",
    threadId,
    userId: "agent-user-a",
  })

type TestDatabase = Awaited<ReturnType<typeof createFixture>>["db"]

const invalidChatContexts: ReadonlyArray<{
  code: string
  label: string
  mutate: (db: TestDatabase) => Promise<unknown>
  threadId?: string
}> = [
  {
    code: "unauthorized",
    label: "expired session",
    mutate: (db) =>
      db
        .update(schema.session)
        .set({ expiresAt: new Date(0) })
        .where(eq(schema.session.id, "agent-session-a")),
  },
  {
    code: "not_found",
    label: "revoked membership",
    mutate: (db) =>
      db.delete(schema.member).where(eq(schema.member.id, "agent-member-a-1")),
  },
  {
    code: "unauthorized",
    label: "different active organization",
    mutate: (db) =>
      db
        .update(schema.session)
        .set({ activeOrganizationId: "agent-org-b" })
        .where(eq(schema.session.id, "agent-session-a")),
  },
  {
    code: "unauthorized",
    label: "different thread",
    mutate: () => Promise.resolve(),
    threadId: "different-thread",
  },
]

describe("Agent ticket and execution lifecycle", () => {
  it("atomically consumes a ticket and starts exactly one chat run", async () => {
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
      internal.startChatRun({
        clientMessageId: "message_atomic_ticket",
        threadId: thread.id,
        ticket: ticket.ticket,
      }),
      internal.startChatRun({
        clientMessageId: "message_atomic_ticket",
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
    expect(grants).toEqual([])
    const runs = await db
      .select({ id: schema.agentRuns.id })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.clientMessageId, "message_atomic_ticket"))
    expect(runs).toHaveLength(1)
  })

  it.each(invalidChatContexts)(
    "rejects $label without consuming the connection ticket",
    async ({ code, mutate, threadId: requestedThreadId }) => {
      const { db } = await createFixture()
      const thread = await createAgentThreadForSession(db, {
        sessionId: "agent-session-a",
        title: "Context validation",
        userId: "agent-user-a",
      })
      const ticket = await issueTicket(db, thread.id)
      await mutate(db)

      await expect(
        createAgentInternalApi(db).startChatRun({
          clientMessageId: "message_invalid_context",
          threadId: requestedThreadId ?? thread.id,
          ticket: ticket.ticket,
        })
      ).rejects.toMatchObject({ code })
      await expect(
        db
          .select({ consumedAt: schema.agentConnectionTickets.consumedAt })
          .from(schema.agentConnectionTickets)
      ).resolves.toEqual([{ consumedAt: null }])
    }
  )

  it("rolls back ticket consumption when asset binding rejects the run", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Asset rollback",
      userId: "agent-user-a",
    })
    const ticket = await issueTicket(db, thread.id)
    const internal = createAgentInternalApi(db)
    const input = {
      clientMessageId: "message_asset_rollback",
      threadId: thread.id,
      ticket: ticket.ticket,
    }

    await expect(
      internal.startChatRun({ ...input, assetIds: ["missing_asset"] })
    ).rejects.toMatchObject({ code: "not_found" })
    await expect(internal.startChatRun(input)).resolves.toMatchObject({
      run: { attempt: 1 },
    })
  })

  it("rolls back ticket consumption when run persistence fails", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Run rollback",
      userId: "agent-user-a",
    })
    const ticket = await issueTicket(db, thread.id)
    const internal = createAgentInternalApi(db)
    const input = {
      clientMessageId: "message_run_rollback",
      threadId: thread.id,
      ticket: ticket.ticket,
    }
    await db.run(sql`
      create trigger fail_agent_run_insert
      before insert on agent_runs
      begin
        select raise(abort, 'private_run_insert_failure');
      end
    `)

    await expect(internal.startChatRun(input)).rejects.toBeDefined()
    await db.run(sql`drop trigger fail_agent_run_insert`)
    await expect(internal.startChatRun(input)).resolves.toMatchObject({
      run: { attempt: 1 },
    })
  })

  it("rolls back ticket consumption when model quota rejects the run", async () => {
    const { db } = await createFixture()
    const now = new Date()
    const window = utcUsageWindow(now, AGENT_USAGE_HOUR_MS)
    await db.transaction((tx) =>
      Array.from(
        { length: AGENT_MODEL_RUN_USER_HOURLY_LIMIT },
        (_, index) => index
      ).reduce<Promise<unknown>>(
        (previous, index) =>
          previous.then(() =>
            consumeAgentResourceLimitInTransaction(tx, {
              kind: "model_run",
              limitCount: AGENT_MODEL_RUN_USER_HOURLY_LIMIT,
              now,
              operationId: `ticket-rollback-${index}`,
              organizationId: "agent-org-a",
              userId: "agent-user-a",
              ...window,
            })
          ),
        Promise.resolve()
      )
    )
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Quota rollback",
      userId: "agent-user-a",
    })
    const ticket = await issueTicket(db, thread.id)
    const internal = createAgentInternalApi(db)
    const input = {
      clientMessageId: "message_quota_rollback",
      threadId: thread.id,
      ticket: ticket.ticket,
    }

    await expect(internal.startChatRun(input)).rejects.toMatchObject({
      code: "rate_limited",
    })
    await db.delete(schema.agentResourceUsageBuckets)
    await expect(internal.startChatRun(input)).resolves.toMatchObject({
      run: { attempt: 1 },
    })
  })

  it("creates one execution lease for concurrent starts of one message", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Concurrent run",
      userId: "agent-user-a",
    })
    const first = await issueTicket(db, thread.id)
    const second = await issueTicket(db, thread.id)
    const internal = createAgentInternalApi(db)
    const startInput = {
      assetIds: [],
      clientMessageId: "message_concurrent",
      estimatedInputTokenCount: 10,
      trigger: "user_message" as const,
    }

    const results = await Promise.allSettled([
      internal.startChatRun({
        ...startInput,
        threadId: thread.id,
        ticket: first.ticket,
      }),
      internal.startChatRun({
        ...startInput,
        threadId: thread.id,
        ticket: second.ticket,
      }),
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
    const firstTicket = await issueTicket(db, thread.id)
    const firstChatRun = await internal.startChatRun({
      assetIds: [],
      clientMessageId: "message_retry",
      estimatedInputTokenCount: 10,
      threadId: thread.id,
      ticket: firstTicket.ticket,
      trigger: "user_message",
    })
    const first = firstChatRun.run
    await internal.finalizeRun({ grant: first.grant, outcome: "failed" })

    const nextTicket = await issueTicket(db, thread.id)
    const retryChatRun = await internal.startChatRun({
      assetIds: [],
      clientMessageId: "message_retry",
      estimatedInputTokenCount: 10,
      threadId: thread.id,
      ticket: nextTicket.ticket,
      trigger: "user_message",
    })
    const retry = retryChatRun.run

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
