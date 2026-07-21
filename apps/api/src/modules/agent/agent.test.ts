import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import * as v from "valibot"
import { afterEach, describe, expect, it } from "vitest"

import { createApp } from "../../app"
import { env } from "../../env"
import {
  transferSuperAdminById,
  updateMemberRoleById,
} from "../organizations/repository"
import { createAgentInternalApi } from "./internal-api"
import { agentConnectionTicketModel, agentThreadModel } from "./model"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./repository"

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
    `enterprise-agent-api-${crypto.randomUUID()}.db`
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
      id: "agent-user-a",
      name: "Agent User A",
      email: "agent-a@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "agent-user-b",
      name: "Agent User B",
      email: "agent-b@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(schema.organization).values([
    {
      id: "agent-org-a",
      name: "Agent Org A",
      slug: "agent-org-a",
      createdAt: now,
    },
    {
      id: "agent-org-b",
      name: "Agent Org B",
      slug: "agent-org-b",
      createdAt: now,
    },
  ])
  await db.insert(schema.member).values([
    {
      id: "agent-member-a-1",
      organizationId: "agent-org-a",
      userId: "agent-user-a",
      role: "super_admin",
      createdAt: now,
    },
    {
      id: "agent-member-a-2",
      organizationId: "agent-org-a",
      userId: "agent-user-b",
      role: "member",
      createdAt: now,
    },
    {
      id: "agent-member-b-1",
      organizationId: "agent-org-b",
      userId: "agent-user-a",
      role: "admin",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values([
    {
      id: "agent-session-a",
      userId: "agent-user-a",
      token: "agent-token-a",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "agent-org-a",
    },
    {
      id: "agent-session-b",
      userId: "agent-user-b",
      token: "agent-token-b",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "agent-org-a",
    },
  ])
  await db.insert(schema.issues).values([
    {
      id: "agent-issue-a",
      organizationId: "agent-org-a",
      number: 1,
      title: "Fix API boundary",
      description: "Keep the tenant projection minimal",
      status: "open",
      priority: "high",
      assigneeId: "agent-user-b",
      creatorId: "agent-user-a",
      labels: ["Backend", "Security"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "agent-issue-b",
      organizationId: "agent-org-b",
      number: 1,
      title: "Other tenant issue",
      description: "Must not be visible",
      status: "open",
      priority: "urgent",
      creatorId: "agent-user-a",
      labels: ["Secret"],
      createdAt: now,
      updatedAt: now,
    },
  ])

  return { app: createApp(db), db }
}

const headers = (
  userId = "agent-user-a",
  sessionId = "agent-session-a",
  activeOrganizationId = "agent-org-a"
) => ({
  "content-type": "application/json",
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
  } = {}
) =>
  new Request(`http://localhost${path}`, {
    method: input.method ?? "GET",
    headers: headers(input.userId, input.sessionId, input.activeOrganizationId),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })

describe("Agent public control plane", () => {
  it("returns the same not-found response for other-owner and other-tenant threads", async () => {
    const { app, db } = await createFixture()

    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    expect(createdResponse.status).toBe(201)
    const created = v.parse(agentThreadModel, await createdResponse.json())
    expect(created.title).toBe("New conversation")

    const connectionResponse = await app.handle(
      request("/agent/connections", {
        method: "POST",
        body: { threadId: created.id },
      })
    )
    expect(connectionResponse.status).toBe(200)
    expect(connectionResponse.headers.get("cache-control")).toBe(
      "private, no-store"
    )
    expect(
      v.parse(agentConnectionTicketModel, await connectionResponse.json())
        .ticket
    ).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const otherOwnerResponse = await app.handle(
      request(`/agent/threads/${created.id}/archive`, {
        method: "POST",
        body: {},
        userId: "agent-user-b",
        sessionId: "agent-session-b",
      })
    )
    expect(otherOwnerResponse.status).toBe(404)

    await db.insert(schema.agentThreads).values({
      id: "agent-thread-other-org",
      organizationId: "agent-org-b",
      ownerUserId: "agent-user-a",
      title: "Other organization",
    })
    const inactiveTenantResponse = await app.handle(
      request("/agent/threads/agent-thread-other-org/archive", {
        method: "POST",
        body: {},
      })
    )
    expect(inactiveTenantResponse.status).toBe(404)
    expect(await inactiveTenantResponse.json()).toMatchObject({
      error: { code: "not_found" },
    })

    const archivedResponse = await app.handle(
      request(`/agent/threads/${created.id}/archive`, {
        method: "POST",
        body: {},
      })
    )
    expect(archivedResponse.status).toBe(200)
    expect(await archivedResponse.json()).toMatchObject({ status: "archived" })

    const listResponse = await app.handle(request("/agent/threads"))
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual([])
  })
})

describe("Agent internal capability API", () => {
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

  it("returns only allowlisted account, organization, member, label, and issue projections", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Read tools",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const internal = createAgentInternalApi(db)
    const connection = await internal.consumeConnectionTicket({
      ticket: ticket.ticket,
      threadId: thread.id,
    })
    const run = await internal.startRun({
      grant: connection.grant,
      clientMessageId: "message-read-tools",
    })

    const [account, activeOrganization, members, labels, issues, issue] =
      await Promise.all([
        internal.readAccountContext({ grant: run.grant }),
        internal.readActiveOrganization({ grant: run.grant }),
        internal.searchOrganizationMembers({
          grant: run.grant,
          query: "Agent",
        }),
        internal.searchIssueLabels({ grant: run.grant, query: "back" }),
        internal.searchIssues({ grant: run.grant, search: "boundary" }),
        internal.getIssue({
          grant: run.grant,
          lookup: "number",
          number: 1,
        }),
      ])

    expect(account).toEqual({
      name: "Agent User A",
      profileImage: null,
    })
    expect(account).not.toHaveProperty("email")
    expect(activeOrganization).toMatchObject({
      slug: "agent-org-a",
      role: "super_admin",
      permissions: { canDeleteAnyIssue: true },
    })
    expect(members).toHaveLength(2)
    expect(members[0]).not.toHaveProperty("email")
    expect(labels).toEqual([{ label: "Backend", usageCount: 1 }])
    expect(issues).toHaveLength(1)
    expect(issues[0]).not.toHaveProperty("organizationId")
    expect(issues[0]).not.toHaveProperty("creatorId")
    expect(issue).toMatchObject({ id: "agent-issue-a", number: 1 })
    expect(issue).not.toHaveProperty("organizationId")

    await expect(
      internal.getIssue({
        grant: run.grant,
        lookup: "id",
        id: "agent-issue-b",
      })
    ).rejects.toMatchObject({ code: "not_found" })

    await expect(
      internal.finishRun({ grant: run.grant, outcome: "completed" })
    ).resolves.toEqual({ runId: run.runId, status: "completed" })
    await expect(
      internal.readAccountContext({ grant: run.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })

  it("invalidates old grants and runs in the organization-switch transaction", async () => {
    const { app, db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Switch organization",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const internal = createAgentInternalApi(db)
    const connection = await internal.consumeConnectionTicket({
      ticket: ticket.ticket,
      threadId: thread.id,
    })
    const run = await internal.startRun({
      grant: connection.grant,
      clientMessageId: "message-before-switch",
    })

    const switched = await app.handle(
      request("/organizations/agent-org-b/activate", {
        method: "POST",
        body: {},
      })
    )
    expect(switched.status).toBe(200)
    expect(await switched.json()).toEqual({
      activeOrganizationId: "agent-org-b",
    })

    const contexts = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "agent-session-a"))
    expect(contexts).toEqual([{ contextEpoch: 2 }])
    const grants = await db
      .select({ revokedAt: schema.agentGrants.revokedAt })
      .from(schema.agentGrants)
      .where(eq(schema.agentGrants.sessionId, "agent-session-a"))
    expect(grants).not.toHaveLength(0)
    expect(grants.every(({ revokedAt }) => revokedAt instanceof Date)).toBe(
      true
    )
    const runs = await db
      .select({ status: schema.agentRuns.status })
      .from(schema.agentRuns)
      .where(
        and(
          eq(schema.agentRuns.sessionId, "agent-session-a"),
          eq(schema.agentRuns.id, run.runId)
        )
      )
    expect(runs).toEqual([{ status: "canceled" }])
    await expect(
      internal.readActiveOrganization({ grant: run.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })

    const repeated = await app.handle(
      request("/organizations/agent-org-b/activate", {
        method: "POST",
        body: {},
        activeOrganizationId: "agent-org-b",
      })
    )
    expect(repeated.status).toBe(200)
    const repeatedContext = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "agent-session-a"))
    expect(repeatedContext).toEqual([{ contextEpoch: 2 }])
  })

  it("revokes the target user's active context when their role changes", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-b",
      userId: "agent-user-b",
      title: "Role change",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-b",
      userId: "agent-user-b",
      threadId: thread.id,
    })
    const internal = createAgentInternalApi(db)
    const connection = await internal.consumeConnectionTicket({
      ticket: ticket.ticket,
      threadId: thread.id,
    })
    const run = await internal.startRun({
      grant: connection.grant,
      clientMessageId: "message-before-role-change",
    })

    await expect(
      updateMemberRoleById(db, {
        actorUserId: "agent-user-a",
        memberId: "agent-member-a-2",
        organizationId: "agent-org-a",
        previousRole: "member",
        role: "admin",
      })
    ).resolves.toMatchObject({ role: "admin" })

    const context = await db
      .select({ contextEpoch: schema.agentSessionContexts.contextEpoch })
      .from(schema.agentSessionContexts)
      .where(eq(schema.agentSessionContexts.sessionId, "agent-session-b"))
    expect(context).toEqual([{ contextEpoch: 2 }])
    const storedRun = await db
      .select({ status: schema.agentRuns.status })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, run.runId))
    expect(storedRun).toEqual([{ status: "canceled" }])
    await expect(
      internal.readActiveOrganization({ grant: run.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })

  it("revokes both promoted and demoted users during super-admin transfer", async () => {
    const { db } = await createFixture()
    const internal = createAgentInternalApi(db)
    const createRun = async (input: {
      clientMessageId: string
      sessionId: string
      userId: string
    }) => {
      const thread = await createAgentThreadForSession(db, {
        sessionId: input.sessionId,
        userId: input.userId,
        title: `Transfer ${input.userId}`,
      })
      const ticket = await issueAgentConnectionTicket(db, {
        sessionId: input.sessionId,
        userId: input.userId,
        threadId: thread.id,
      })
      const connection = await internal.consumeConnectionTicket({
        ticket: ticket.ticket,
        threadId: thread.id,
      })
      return internal.startRun({
        grant: connection.grant,
        clientMessageId: input.clientMessageId,
      })
    }
    const actorRun = await createRun({
      clientMessageId: "message-transfer-actor",
      sessionId: "agent-session-a",
      userId: "agent-user-a",
    })
    const targetRun = await createRun({
      clientMessageId: "message-transfer-target",
      sessionId: "agent-session-b",
      userId: "agent-user-b",
    })

    await expect(
      transferSuperAdminById(db, {
        actorMemberId: "agent-member-a-1",
        actorUserId: "agent-user-b",
        organizationId: "agent-org-a",
        targetMemberId: "agent-member-a-2",
      })
    ).resolves.toBe("actor_not_super_admin")

    await expect(
      transferSuperAdminById(db, {
        actorMemberId: "agent-member-a-1",
        actorUserId: "agent-user-a",
        organizationId: "agent-org-a",
        targetMemberId: "agent-member-a-2",
      })
    ).resolves.toBe("transferred")

    const contexts = await db
      .select({
        contextEpoch: schema.agentSessionContexts.contextEpoch,
        sessionId: schema.agentSessionContexts.sessionId,
      })
      .from(schema.agentSessionContexts)
    expect(
      contexts
        .map(({ contextEpoch, sessionId }) => ({ contextEpoch, sessionId }))
        .toSorted((left, right) =>
          left.sessionId.localeCompare(right.sessionId)
        )
    ).toEqual([
      { contextEpoch: 2, sessionId: "agent-session-a" },
      { contextEpoch: 2, sessionId: "agent-session-b" },
    ])
    const runs = await db
      .select({ id: schema.agentRuns.id, status: schema.agentRuns.status })
      .from(schema.agentRuns)
    expect(runs).toEqual(
      expect.arrayContaining([
        { id: actorRun.runId, status: "canceled" },
        { id: targetRun.runId, status: "canceled" },
      ])
    )
    await expect(
      internal.readAccountContext({ grant: actorRun.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
    await expect(
      internal.readAccountContext({ grant: targetRun.grant })
    ).rejects.toMatchObject({ code: "unauthorized" })
  })
})
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
