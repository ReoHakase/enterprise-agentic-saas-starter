import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach, describe, expect, it } from "vitest"

import { createApp } from "../../app"
import { env } from "../../platform/env"
import { hashAgentToken } from "./crypto"
import { createAgentInternalApi } from "./module"
import { configureAgentRuntime, resetAgentRuntimeForTest } from "./runtime"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"
import {
  AGENT_MODEL_RUN_ORGANIZATION_DAILY_LIMIT,
  AGENT_MODEL_RUN_USER_HOURLY_LIMIT,
  AGENT_USAGE_DAY_MS,
  AGENT_USAGE_HOUR_MS,
  AGENT_WEB_SEARCH_USER_HOURLY_LIMIT,
  utcUsageWindow,
} from "./usage/resource-limits"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle-v3",
  import.meta.url
).pathname

const clients: Array<ReturnType<typeof createClient>> = []
const databasePaths: string[] = []

afterEach(async () => {
  resetAgentRuntimeForTest()
  for (const client of clients.splice(0)) client.close()
  await Promise.all(
    databasePaths.splice(0).map((path) => rm(path, { force: true }))
  )
})

const createFixture = async () => {
  const databasePath = join(
    tmpdir(),
    `enterprise-agent-resource-usage-${crypto.randomUUID()}.db`
  )
  databasePaths.push(databasePath)
  const client = createClient({ url: `file:${databasePath}` })
  clients.push(client)
  const db = drizzle({ client, relations: schema.relations })
  await migrate(db, { migrationsFolder })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 2 * AGENT_USAGE_HOUR_MS)
  await db.insert(schema.user).values([
    {
      id: "quota-user-a",
      name: "Quota User A",
      email: "quota-a@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "quota-user-b",
      name: "Quota User B",
      email: "quota-b@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(schema.organization).values([
    {
      id: "quota-org-a",
      name: "Quota Org A",
      slug: "quota-org-a",
      createdAt: now,
    },
    {
      id: "quota-org-b",
      name: "Quota Org B",
      slug: "quota-org-b",
      createdAt: now,
    },
  ])
  await db.insert(schema.member).values([
    {
      id: "quota-member-a",
      organizationId: "quota-org-a",
      userId: "quota-user-a",
      role: "owner",
      createdAt: now,
    },
    {
      id: "quota-member-b",
      organizationId: "quota-org-b",
      userId: "quota-user-b",
      role: "owner",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values([
    {
      id: "quota-session-a",
      userId: "quota-user-a",
      token: "quota-session-token-a",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "quota-org-a",
    },
    {
      id: "quota-session-b",
      userId: "quota-user-b",
      token: "quota-session-token-b",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "quota-org-b",
    },
  ])

  return { db, now }
}

type FixtureDatabase = Awaited<ReturnType<typeof createFixture>>["db"]

const createTicket = async (
  db: FixtureDatabase,
  input: {
    now: Date
    organization: "a" | "b"
    threadId?: string
  }
) => {
  const suffix = input.organization
  const sessionId = `quota-session-${suffix}`
  const userId = `quota-user-${suffix}`
  const thread = input.threadId
    ? { id: input.threadId }
    : await createAgentThreadForSession(db, {
        sessionId,
        userId,
        title: `Quota thread ${suffix}`,
        now: input.now,
      })
  const ticket = await issueAgentConnectionTicket(db, {
    sessionId,
    userId,
    threadId: thread.id,
    now: input.now,
  })
  return { thread, ticket }
}

const startChatRun = async (
  db: FixtureDatabase,
  input: {
    assetIds?: string[]
    clientMessageId: string
    now: Date
    threadId: string
    ticket: string
  }
) => {
  const chatRun = await createAgentInternalApi(db).startChatRun({
    assetIds: input.assetIds,
    clientMessageId: input.clientMessageId,
    threadId: input.threadId,
    ticket: input.ticket,
  })
  return chatRun.run
}

const seedFullBucket = async (
  db: FixtureDatabase,
  input: {
    kind: "model_run"
    limitCount: number
    organizationId: string
    userId: string | null
    windowEnd: Date
    windowStart: Date
  }
) => {
  const bucketId = `seed-${crypto.randomUUID()}`
  await db.transaction(async (tx) => {
    await tx.insert(schema.agentResourceUsageBuckets).values({
      id: bucketId,
      organizationId: input.organizationId,
      userId: input.userId,
      kind: input.kind,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      count: 0,
      limitCount: input.limitCount,
      updatedAt: input.windowStart,
    })
    await tx.insert(schema.agentResourceUsageOperations).values({
      operationId: "seed-full-bucket",
      organizationId: input.organizationId,
      bucketId,
      delta: input.limitCount,
      createdAt: input.windowStart,
    })
  })
}

const attestWebSearch = async (
  db: FixtureDatabase,
  input: { query: string; runId: string }
) => {
  await db
    .update(schema.agentRuns)
    .set({
      webSearchQueryHash: await hashAgentToken(`web-query\u0000${input.query}`),
    })
    .where(eq(schema.agentRuns.id, input.runId))
}

const createAttestedWebSearchRun = async (
  db: FixtureDatabase,
  input: {
    clientMessageId: string
    now: Date
    organization: "a" | "b"
    query: string
  }
) => {
  const ticket = await createTicket(db, {
    now: input.now,
    organization: input.organization,
  })
  const run = await startChatRun(db, {
    clientMessageId: input.clientMessageId,
    now: input.now,
    threadId: ticket.thread.id,
    ticket: ticket.ticket.ticket,
  })
  await attestWebSearch(db, { query: input.query, runId: run.runId })
  return run
}

describe("Agent課金resourceの予約", () => {
  it("並列model runを原子的に1つだけ許可する", async () => {
    const { db, now } = await createFixture()
    const first = await createTicket(db, { now, organization: "a" })
    const second = await createTicket(db, {
      now,
      organization: "a",
      threadId: first.thread.id,
    })

    const results = await Promise.allSettled([
      startChatRun(db, {
        clientMessageId: "quota_parallel_1",
        now,
        threadId: first.thread.id,
        ticket: first.ticket.ticket,
      }),
      startChatRun(db, {
        clientMessageId: "quota_parallel_2",
        now,
        threadId: second.thread.id,
        ticket: second.ticket.ticket,
      }),
    ])
    const fulfilled = results.filter(
      (
        result
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof startChatRun>>
      > => result.status === "fulfilled"
    )
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({
      code: "rate_limited",
      retryAfter: expect.any(Number),
    })

    const firstBuckets = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "model_run"))
    expect(firstBuckets).toEqual([{ count: 1 }, { count: 1 }])
  })

  it("active runの期限切れ後にmodel concurrencyを解放する", async () => {
    const { db, now } = await createFixture()
    const first = await createTicket(db, { now, organization: "a" })
    const firstRun = await startChatRun(db, {
      clientMessageId: "quota_before_expiry",
      now,
      threadId: first.thread.id,
      ticket: first.ticket.ticket,
    })

    const afterExpiry = new Date()
    await db
      .update(schema.agentRuns)
      .set({ expiresAt: new Date(afterExpiry.getTime() - 1) })
      .where(eq(schema.agentRuns.id, firstRun.runId))
    const next = await createTicket(db, {
      now: afterExpiry,
      organization: "a",
      threadId: first.thread.id,
    })
    await expect(
      startChatRun(db, {
        clientMessageId: "quota_after_expiry",
        now: afterExpiry,
        threadId: next.thread.id,
        ticket: next.ticket.ticket,
      })
    ).resolves.toMatchObject({ attempt: 1 })
  })

  it("同一runのprovider attemptごとにmodel quotaを1回consumeする", async () => {
    const { db, now } = await createFixture()
    const first = await createTicket(db, { now, organization: "a" })
    const run = await startChatRun(db, {
      clientMessageId: "quota_retry",
      now,
      threadId: first.thread.id,
      ticket: first.ticket.ticket,
    })
    await createAgentInternalApi(db).finalizeRun({
      grant: run.grant,
      outcome: "failed",
    })

    const retriedAt = new Date()
    const retry = await createTicket(db, {
      now: retriedAt,
      organization: "a",
      threadId: first.thread.id,
    })
    await expect(
      startChatRun(db, {
        clientMessageId: "quota_retry",
        now: retriedAt,
        threadId: retry.thread.id,
        ticket: retry.ticket.ticket,
      })
    ).resolves.toMatchObject({ attempt: 2, runId: run.runId })

    const buckets = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "model_run"))
    expect(buckets).toEqual([{ count: 2 }, { count: 2 }])
  })

  it("window由来の429を返して別model scopeをrollbackする", async () => {
    const { db, now } = await createFixture()
    const userWindow = utcUsageWindow(now, AGENT_USAGE_HOUR_MS)
    await seedFullBucket(db, {
      kind: "model_run",
      limitCount: AGENT_MODEL_RUN_USER_HOURLY_LIMIT,
      organizationId: "quota-org-a",
      userId: "quota-user-a",
      ...userWindow,
    })
    const connection = await createTicket(db, { now, organization: "a" })

    await expect(
      startChatRun(db, {
        clientMessageId: "quota_user_limit",
        now,
        threadId: connection.thread.id,
        ticket: connection.ticket.ticket,
      })
    ).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: expect.any(Number),
    })
    const buckets = await db
      .select({
        count: schema.agentResourceUsageBuckets.count,
        userId: schema.agentResourceUsageBuckets.userId,
      })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "model_run"))
    expect(buckets).toEqual([
      { count: AGENT_MODEL_RUN_USER_HOURLY_LIMIT, userId: "quota-user-a" },
    ])
  })

  it("organization model quotaを対象テナントへscopeする", async () => {
    const { db, now } = await createFixture()
    const organizationWindow = utcUsageWindow(now, AGENT_USAGE_DAY_MS)
    await seedFullBucket(db, {
      kind: "model_run",
      limitCount: AGENT_MODEL_RUN_ORGANIZATION_DAILY_LIMIT,
      organizationId: "quota-org-a",
      userId: null,
      ...organizationWindow,
    })
    const organizationA = await createTicket(db, {
      now,
      organization: "a",
    })
    const organizationB = await createTicket(db, {
      now,
      organization: "b",
    })

    await expect(
      startChatRun(db, {
        clientMessageId: "quota_org_a_limited",
        now,
        threadId: organizationA.thread.id,
        ticket: organizationA.ticket.ticket,
      })
    ).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: expect.any(Number),
    })
    await expect(
      startChatRun(db, {
        clientMessageId: "quota_org_b_allowed",
        now,
        threadId: organizationB.thread.id,
        ticket: organizationB.ticket.ticket,
      })
    ).resolves.toMatchObject({ attempt: 1 })
  })

  it("同時実行時に最後のWeb検索slotを過剰予約しない", async () => {
    const { db, now } = await createFixture()
    const connection = await createTicket(db, { now, organization: "a" })
    const run = await startChatRun(db, {
      clientMessageId: "quota_web_parallel",
      now,
      threadId: connection.thread.id,
      ticket: connection.ticket.ticket,
    })
    const query = "Cloudflare R2 current limits"
    await attestWebSearch(db, { query, runId: run.runId })
    const userWindow = utcUsageWindow(now, AGENT_USAGE_HOUR_MS)
    const bucketId = "web-search-user-near-limit"
    await db.transaction(async (tx) => {
      await tx.insert(schema.agentResourceUsageBuckets).values({
        id: bucketId,
        organizationId: "quota-org-a",
        userId: "quota-user-a",
        kind: "web_search",
        ...userWindow,
        count: 0,
        limitCount: AGENT_WEB_SEARCH_USER_HOURLY_LIMIT,
        updatedAt: now,
      })
      await tx.insert(schema.agentResourceUsageOperations).values({
        operationId: "seed-web-search-near-limit",
        organizationId: "quota-org-a",
        bucketId,
        delta: AGENT_WEB_SEARCH_USER_HOURLY_LIMIT - 1,
        createdAt: now,
      })
    })

    const results = await Promise.allSettled([
      createAgentInternalApi(db).authorizeWebSearch({
        grant: run.grant,
        operationId: "web_search_parallel_1",
        query,
      }),
      createAgentInternalApi(db).authorizeWebSearch({
        grant: run.grant,
        operationId: "web_search_parallel_2",
        query,
      }),
    ])
    const bucket = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.id, bucketId))
    expect({
      bucket,
      outcomes: results.map((result) =>
        result.status === "fulfilled"
          ? { status: result.status }
          : {
              code:
                typeof result.reason === "object" && result.reason !== null
                  ? Reflect.get(result.reason, "code")
                  : undefined,
              status: result.status,
            }
      ),
    }).toEqual({
      bucket: [{ count: AGENT_WEB_SEARCH_USER_HOURLY_LIMIT }],
      outcomes: expect.arrayContaining([
        { status: "fulfilled" },
        { code: "rate_limited", status: "rejected" },
      ]),
    })
  })

  it("同じoperationのWeb検索予約を冪等に再利用する", async () => {
    const { db, now } = await createFixture()
    const query = "Cloudflare R2 current limits"
    const run = await createAttestedWebSearchRun(db, {
      clientMessageId: "quota_web_idempotent",
      now,
      organization: "a",
      query,
    })
    const internal = createAgentInternalApi(db)

    await expect(
      internal.authorizeWebSearch({
        grant: run.grant,
        operationId: "web_search_1",
        query,
      })
    ).resolves.toEqual({ query, reserved: true, reused: false })
    await expect(
      internal.authorizeWebSearch({
        grant: run.grant,
        operationId: "web_search_1",
        query,
      })
    ).resolves.toEqual({ query, reserved: true, reused: true })
  })

  it("Web検索上限をtenantごとに分離する", async () => {
    const { db, now } = await createFixture()
    const query = "Cloudflare R2 current limits"
    const runA = await createAttestedWebSearchRun(db, {
      clientMessageId: "quota_web_a",
      now,
      organization: "a",
      query,
    })
    const runB = await createAttestedWebSearchRun(db, {
      clientMessageId: "quota_web_b",
      now,
      organization: "b",
      query,
    })
    const internal = createAgentInternalApi(db)

    await Array.from(
      { length: AGENT_WEB_SEARCH_USER_HOURLY_LIMIT },
      (_, index) => index + 1
    ).reduce<Promise<void>>(
      (previous, index) =>
        previous.then(() =>
          internal
            .authorizeWebSearch({
              grant: runA.grant,
              operationId: `web_search_${index}`,
              query,
            })
            .then(() => undefined)
        ),
      Promise.resolve()
    )
    await expect(
      internal.authorizeWebSearch({
        grant: runA.grant,
        operationId: "web_search_over_limit",
        query,
      })
    ).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: expect.any(Number),
    })
    await expect(
      internal.authorizeWebSearch({
        grant: runB.grant,
        operationId: "web_search_1",
        query,
      })
    ).resolves.toEqual({ query, reserved: true, reused: false })

    const buckets = await db
      .select({
        count: schema.agentResourceUsageBuckets.count,
        organizationId: schema.agentResourceUsageBuckets.organizationId,
      })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "web_search"))
    expect(buckets).toEqual(
      expect.arrayContaining([
        {
          count: AGENT_WEB_SEARCH_USER_HOURLY_LIMIT,
          organizationId: "quota-org-a",
        },
        {
          count: AGENT_WEB_SEARCH_USER_HOURLY_LIMIT,
          organizationId: "quota-org-a",
        },
        { count: 1, organizationId: "quota-org-b" },
        { count: 1, organizationId: "quota-org-b" },
      ])
    )
  })

  it("Web検索予約時にrunへ利用時刻を記録する", async () => {
    const { db, now } = await createFixture()
    const query = "Cloudflare R2 current limits"
    const run = await createAttestedWebSearchRun(db, {
      clientMessageId: "quota_web_marker",
      now,
      organization: "a",
      query,
    })
    await createAgentInternalApi(db).authorizeWebSearch({
      grant: run.grant,
      operationId: "web_search_marker",
      query,
    })
    const markedRuns = await db
      .select({
        id: schema.agentRuns.id,
        webSearchUsedAt: schema.agentRuns.webSearchUsedAt,
      })
      .from(schema.agentRuns)
    expect(markedRuns).toEqual([
      { id: run.runId, webSearchUsedAt: expect.any(Date) },
    ])
  })

  it("内部bodyを漏らさず上限付き429を公開chatへ伝播する", async () => {
    const { db, now } = await createFixture()
    const liveNow = new Date()
    await db
      .update(schema.session)
      .set({
        expiresAt: new Date(liveNow.getTime() + AGENT_USAGE_HOUR_MS),
        updatedAt: liveNow,
      })
      .where(eq(schema.session.id, "quota-session-a"))
    const thread = await createAgentThreadForSession(db, {
      sessionId: "quota-session-a",
      userId: "quota-user-a",
      title: "Public quota response",
      now,
    })
    configureAgentRuntime({
      fetch: () =>
        Promise.resolve(
          new Response('{"error":{"message":"RAW_INTERNAL_QUOTA_BODY"}}', {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": "37",
              "x-internal-secret": "must-not-propagate",
            },
          })
        ),
    })
    const app = createApp(db)
    const response = await app.handle(
      new Request("http://localhost/agent/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: env.CORS_ORIGIN[0] ?? env.API_PUBLIC_URL,
          "x-test-active-organization-id": "quota-org-a",
          "x-test-session-created-at": liveNow.toISOString(),
          "x-test-session-id": "quota-session-a",
          "x-test-user-id": "quota-user-a",
        },
        body: JSON.stringify({
          threadId: thread.id,
          messageId: "quota_public_429",
          contentSegments: [
            { type: "text", text: "Start a bounded model run" },
          ],
          assetIds: [],
          timezone: "Asia/Tokyo",
        }),
      })
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("37")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-internal-secret")).toBeNull()
    const body = await response.json()
    expect(body).toEqual({
      error: "rate_limited",
      message: "Too many requests. Try again later.",
    })
    expect(JSON.stringify(body)).not.toContain("RAW_INTERNAL_QUOTA_BODY")
  })
})
