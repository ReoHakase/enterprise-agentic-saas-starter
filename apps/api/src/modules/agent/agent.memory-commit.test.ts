import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { and, eq, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { describe, expect, it } from "vitest"

import { createFixture } from "./agent.test-support"
import { createAgentInternalApp } from "./internal-api"
import { createAgentInternalApi } from "./module"
import { settleAgentMemoryCommit } from "./threads/memory-commit-repository"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

type FixtureDb = Awaited<ReturnType<typeof createFixture>>["db"]

const startRun = async (db: FixtureDb, clientMessageId: string) => {
  const internal = createAgentInternalApi(db)
  const thread = await createAgentThreadForSession(db, {
    sessionId: "agent-session-a",
    title: "Memory commit",
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
    clientMessageId,
    grant: connection.grant,
  })
  return { internal, run, thread }
}

const acknowledgement = (applicationRunId: string) => ({
  acknowledged: true,
  applicationRunId,
})
const readRunStatus = (db: FixtureDb, runId: string) =>
  db
    .select({ status: schema.agentRuns.status })
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))

describe("Agent memory commit settlement", () => {
  it("is reachable only at the exact private Service Binding path", async () => {
    const { app: publicApp, db } = await createFixture()
    const request = new Request(
      "https://agent-internal.invalid/internal/agent/memory/commit-settlement",
      {
        body: JSON.stringify({ applicationRunId: "missing_run" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }
    )
    expect((await publicApp.handle(request.clone())).status).toBe(404)
    const privateApp = createAgentInternalApp(db)
    expect((await privateApp.handle(request.clone())).status).toBe(200)
    expect(
      (
        await privateApp.handle(
          new Request(request.url, {
            body: JSON.stringify({
              applicationRunId: "missing_run",
              desiredOutcome: "completed",
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          })
        )
      ).status
    ).toBe(400)
    const nearby = new Request(
      "https://agent-internal.invalid/internal/agent/memory/commit-settlement/extra",
      { method: "POST" }
    )
    expect((await privateApp.handle(nearby)).status).toBe(401)
  })

  it("settles one running application ledger idempotently under concurrency", async () => {
    const { databasePath, db } = await createFixture()
    const { internal, run } = await startRun(db, "memory-commit-concurrent")
    const firstClient = createClient({ url: `file:${databasePath}` })
    const secondClient = createClient({ url: `file:${databasePath}` })
    try {
      await firstClient.execute("pragma journal_mode = WAL")
      await Promise.all([
        firstClient.execute("pragma busy_timeout = 0"),
        secondClient.execute("pragma busy_timeout = 0"),
      ])
      const results = await Promise.all(
        [firstClient, secondClient].map((client) =>
          createAgentInternalApi(
            drizzle(client, { schema })
          ).settleMemoryCommit({ applicationRunId: run.runId })
        )
      )
      expect(results).toEqual([
        acknowledgement(run.runId),
        acknowledgement(run.runId),
      ])
    } finally {
      firstClient.close()
      secondClient.close()
    }

    await expect(
      db
        .select({ status: schema.agentRuns.status })
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, run.runId))
    ).resolves.toEqual([{ status: "completed" }])
    await expect(
      db
        .select({ id: schema.agentGrants.id })
        .from(schema.agentGrants)
        .where(
          and(
            eq(schema.agentGrants.runId, run.runId),
            isNull(schema.agentGrants.revokedAt)
          )
        )
    ).resolves.toEqual([])
    await expect(
      internal.settleMemoryCommit({ applicationRunId: run.runId })
    ).resolves.toEqual(acknowledgement(run.runId))
  })

  it("accepts one idempotent title usage event after settlement revokes the grant", async () => {
    const { db } = await createFixture()
    const { internal, run } = await startRun(db, "memory-commit-title-usage")
    await internal.settleMemoryCommit({ applicationRunId: run.runId })

    const usage = {
      grant: run.grant,
      provider: "openrouter" as const,
      model: "test/title-model",
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
      runEventId: "title_1",
    }
    await expect(internal.recordUsage(usage)).resolves.toMatchObject({
      recorded: true,
    })
    await expect(internal.recordUsage(usage)).resolves.toMatchObject({
      recorded: false,
    })
  })

  it("acknowledges missing and terminal runs without changing their outcome", async () => {
    const { db } = await createFixture()
    const { internal, run } = await startRun(db, "memory-commit-terminal")
    await internal.cancelRun({ grant: run.grant })

    await expect(
      internal.settleMemoryCommit({ applicationRunId: run.runId })
    ).resolves.toEqual(acknowledgement(run.runId))
    await expect(
      internal.settleMemoryCommit({ applicationRunId: "missing_run" })
    ).resolves.toEqual(acknowledgement("missing_run"))
    await expect(
      db
        .select({ status: schema.agentRuns.status })
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, run.runId))
    ).resolves.toEqual([{ status: "canceled" }])
  })

  it("does not revalidate authorization or override an already terminal app run", async () => {
    const contextFixture = await createFixture()
    const contextRun = await startRun(
      contextFixture.db,
      "memory-settlement-context"
    )
    await contextFixture.db
      .update(schema.agentSessionContexts)
      .set({ contextEpoch: 2 })
      .where(eq(schema.agentSessionContexts.sessionId, "agent-session-a"))
    await contextRun.internal.settleMemoryCommit({
      applicationRunId: contextRun.run.runId,
    })

    const membershipFixture = await createFixture()
    const membershipRun = await startRun(
      membershipFixture.db,
      "memory-settlement-membership"
    )
    await membershipFixture.db
      .delete(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, "agent-org-a"),
          eq(schema.member.userId, "agent-user-a")
        )
      )
    await membershipRun.internal.settleMemoryCommit({
      applicationRunId: membershipRun.run.runId,
    })

    const threadFixture = await createFixture()
    const threadRun = await startRun(
      threadFixture.db,
      "memory-settlement-thread"
    )
    await threadFixture.db
      .update(schema.agentThreads)
      .set({ archivedAt: new Date(), status: "archived" })
      .where(eq(schema.agentThreads.id, threadRun.thread.id))
    await threadRun.internal.settleMemoryCommit({
      applicationRunId: threadRun.run.runId,
    })

    const expiryFixture = await createFixture()
    const expiryRun = await startRun(
      expiryFixture.db,
      "memory-settlement-expiry"
    )
    await settleAgentMemoryCommit(expiryFixture.db, {
      applicationRunId: expiryRun.run.runId,
      now: new Date(new Date(expiryRun.run.expiresAt).getTime() + 1),
    })

    await expect(
      Promise.all([
        readRunStatus(contextFixture.db, contextRun.run.runId),
        readRunStatus(membershipFixture.db, membershipRun.run.runId),
        readRunStatus(threadFixture.db, threadRun.run.runId),
        readRunStatus(expiryFixture.db, expiryRun.run.runId),
      ])
    ).resolves.toEqual([
      [{ status: "canceled" }],
      [{ status: "completed" }],
      [{ status: "completed" }],
      [{ status: "completed" }],
    ])
  })
})
