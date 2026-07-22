import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { and, eq, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import * as v from "valibot"
import { afterEach, describe, expect, it } from "vitest"

import { createAgentInternalClient } from "../../agent-client"
import { createApp } from "../../app"
import { env } from "../../env"
import {
  transferSuperAdminById,
  updateMemberRoleById,
} from "../organizations/repository"
import { createAgentInternalApi, createAgentInternalApp } from "./internal-api"
import { agentThreadModel } from "./model"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./repository"
import {
  configureAgentRuntime,
  resetAgentRuntimeForTest,
  type AgentRuntimeBinding,
} from "./runtime"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle",
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

const configureAgentStreamCapture = () => {
  const inputs: Record<string, unknown>[] = []
  const binding: AgentRuntimeBinding = {
    async fetch(input, init) {
      const privateRequest =
        input instanceof Request ? input : new Request(input, init)
      const payload: unknown = await privateRequest.json()
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Invalid private Agent test request")
      }
      inputs.push(Object.fromEntries(Object.entries(payload)))
      return new Response("data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream" },
      })
    },
  }
  configureAgentRuntime(binding)
  return inputs
}

describe("Agent public control plane", () => {
  it("requires the trusted CSRF Origin before preparing a private run", async () => {
    const { app } = await createFixture()
    const inputs = configureAgentStreamCapture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadModel, await createdResponse.json())
    const { origin: _origin, ...headersWithoutOrigin } = headers()
    const response = await app.handle(
      new Request("http://localhost/agent/chat", {
        method: "POST",
        headers: headersWithoutOrigin,
        body: JSON.stringify({
          threadId: thread.id,
          message: {
            id: "message_missing_origin",
            role: "user",
            parts: [{ type: "text", text: "Do not start" }],
          },
          assetIds: [],
          timezone: "Asia/Tokyo",
        }),
      })
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: {
        code: "csrf_origin_forbidden",
        context: { reason: "missing_origin" },
      },
    })
    expect(inputs).toEqual([])
  })

  it("forwards only bounded run control status and retry timing", async () => {
    const { app } = await createFixture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadModel, await createdResponse.json())
    const privateBody = "private database detail sk-secret-value"
    const runtimeResponses = [
      { status: 409, retryAfter: "99999" },
      { status: 429, retryAfter: "37" },
    ]
    configureAgentRuntime({
      fetch: () => {
        const response = runtimeResponses.shift()
        if (!response) throw new Error("Missing runtime response fixture")
        return Promise.resolve(
          new Response(privateBody, {
            status: response.status,
            headers: { "retry-after": response.retryAfter },
          })
        )
      },
    })

    const conflict = await app.handle(
      request("/agent/chat", {
        method: "POST",
        body: {
          threadId: thread.id,
          message: {
            id: "message_control_conflict",
            role: "user",
            parts: [{ type: "text", text: "Retry this message" }],
          },
          assetIds: [],
          timezone: "Asia/Tokyo",
        },
      })
    )
    expect(conflict.status).toBe(409)
    expect(conflict.headers.get("retry-after")).toBeNull()
    const conflictText = await conflict.text()
    expect(conflictText).toBe("Agent run already in progress")

    const limited = await app.handle(
      request("/agent/chat", {
        method: "POST",
        body: {
          threadId: thread.id,
          message: {
            id: "message_control_limited",
            role: "user",
            parts: [{ type: "text", text: "Try when capacity is ready" }],
          },
          assetIds: [],
          timezone: "Asia/Tokyo",
        },
      })
    )
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("37")
    const limitedText = await limited.text()
    expect(limitedText).toBe("Agent capacity temporarily limited")
    expect(`${conflictText} ${limitedText}`).not.toContain(privateBody)
  })

  it("returns the same not-found response for other-owner and other-tenant threads", async () => {
    const { app, db } = await createFixture()

    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    expect(createdResponse.status).toBe(201)
    const created = v.parse(agentThreadModel, await createdResponse.json())
    expect(created.title).toBe("New conversation")

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

  it("accepts only the latest user message and keeps the private ticket off the response", async () => {
    const { app } = await createFixture()
    const inputs = configureAgentStreamCapture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadModel, await createdResponse.json())

    const response = await app.handle(
      request("/agent/chat", {
        method: "POST",
        body: {
          threadId: thread.id,
          message: {
            id: "message_public_1",
            role: "user",
            parts: [{ type: "text", text: "Create an Issue" }],
          },
          assetIds: [],
          timezone: "Asia/Tokyo",
        },
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(await response.text()).not.toContain("ticket")
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toMatchObject({
      assetIds: [],
      clientMessageId: "message_public_1",
      threadId: thread.id,
      timezone: "Asia/Tokyo",
      trigger: "user_message",
    })
    expect(inputs[0]?.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const history = await app.handle(
      request(`/agent/threads/${thread.id}/messages`)
    )
    expect(history.status).toBe(200)
    expect(await history.json()).toEqual([
      {
        id: "message_public_1",
        role: "user",
        parts: [{ type: "text", text: "Create an Issue" }],
      },
    ])

    const overposted = await app.handle(
      request("/agent/chat", {
        method: "POST",
        body: {
          threadId: thread.id,
          message: {
            id: "message_public_2",
            role: "user",
            parts: [{ type: "text", text: "Secret history" }],
          },
          messages: [],
          assetIds: [],
          timezone: "Asia/Tokyo",
        },
      })
    )
    expect(overposted.status).toBe(400)
    expect(inputs).toHaveLength(1)
  })

  it("continues only the last persisted allowlisted client tool call", async () => {
    const { app, db } = await createFixture()
    const inputs = configureAgentStreamCapture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Client continuation",
    })
    const internal = createAgentInternalApi(db)
    const initialTicket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const connection = await internal.consumeConnectionTicket({
      ticket: initialTicket.ticket,
      threadId: thread.id,
    })
    const initialRun = await internal.startRun({
      grant: connection.grant,
      clientMessageId: "message_client_tool_1",
    })
    await internal.appendRunMessages({
      grant: initialRun.grant,
      messages: [
        {
          id: "assistant_client_tool_1",
          role: "assistant",
          parts: [
            {
              type: "tool-ui_read_form_draft",
              toolCallId: "call_client_1",
              state: "input-available",
              input: {},
            },
          ],
        },
      ],
    })
    await internal.finishRun({ grant: initialRun.grant, outcome: "completed" })

    const continuationBody = {
      threadId: thread.id,
      assistantMessageId: "assistant_client_tool_1",
      clientToolResults: [
        {
          toolCallId: "call_client_1",
          toolName: "ui_read_form_draft",
          state: "output-available",
          output: {
            formId: "form_1",
            resource: "issue",
            epoch: "epoch_1",
            values: { title: "Draft" },
            dirtyFields: ["title"],
          },
        },
      ],
      timezone: "Asia/Tokyo",
    }
    const continued = await app.handle(
      request("/agent/chat", {
        method: "POST",
        body: continuationBody,
      })
    )
    expect(continued.status).toBe(200)
    await continued.body?.cancel()
    expect(inputs[0]).toMatchObject({
      assetIds: [],
      threadId: thread.id,
      trigger: "client_tool_result",
    })
    expect(inputs[0]?.clientMessageId).toMatch(/^continuation_[0-9a-f]{64}$/)
    expect(inputs[0]?.messages).toEqual([
      {
        id: "assistant_client_tool_1",
        role: "assistant",
        parts: [
          {
            type: "tool-ui_read_form_draft",
            toolCallId: "call_client_1",
            state: "output-available",
            input: {},
            output: continuationBody.clientToolResults[0]?.output,
          },
        ],
      },
    ])

    const repeated = await app.handle(
      request("/agent/chat", { method: "POST", body: continuationBody })
    )
    expect(repeated.status).toBe(200)
    await repeated.body?.cancel()
    expect(inputs[1]?.clientMessageId).toBe(inputs[0]?.clientMessageId)

    const privateTicket = inputs[0]?.ticket
    const syntheticMessageId = inputs[0]?.clientMessageId
    expect(typeof privateTicket).toBe("string")
    expect(typeof syntheticMessageId).toBe("string")
    if (
      typeof privateTicket !== "string" ||
      typeof syntheticMessageId !== "string"
    ) {
      throw new Error("Missing private continuation capability")
    }
    const continuationConnection = await internal.consumeConnectionTicket({
      ticket: privateTicket,
      threadId: thread.id,
    })
    await internal.startRun({
      grant: continuationConnection.grant,
      clientMessageId: syntheticMessageId,
      trigger: "client_tool_result",
    })
    await expect(
      internal.startRun({
        grant: continuationConnection.grant,
        clientMessageId: syntheticMessageId,
        trigger: "client_tool_result",
      })
    ).rejects.toMatchObject({ code: "unauthorized" })

    const changed = structuredClone(continuationBody)
    const changedResult = changed.clientToolResults[0]
    if (!changedResult) throw new Error("Missing client tool test result")
    changedResult.output.values.title = "Changed"
    const conflict = await app.handle(
      request("/agent/chat", { method: "POST", body: changed })
    )
    expect(conflict.status).toBe(409)
    expect(inputs).toHaveLength(2)
  })
})

describe("Agent private HTTP boundary", () => {
  it("serves the typed Eden client through the same fetch-only boundary", async () => {
    const { db } = await createFixture()
    const internal = createAgentInternalApp(db)
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Private Eden boundary",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const client = createAgentInternalClient({
      fetch(input) {
        expect(input).toBeInstanceOf(Request)
        if (!(input instanceof Request)) {
          throw new TypeError("Service Binding input must be a Request")
        }
        return Promise.resolve(internal.handle(input))
      },
    })

    const connection = await client.internal.agent.connections.consume.post({
      threadId: thread.id,
      ticket: ticket.ticket,
    })
    expect(connection.error).toBeNull()
    expect(connection.status).toBe(200)
    if (!connection.data || "error" in connection.data) {
      throw new Error("Missing private connection")
    }
    const connectionData = connection.data
    expect(typeof connectionData.expiresAt).toBe("string")
    expect(connectionData).toMatchObject({
      expiresAt: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      ),
      grant: expect.stringMatching(/^[A-Za-z0-9._~-]{32,512}$/),
      thread: { id: thread.id },
    })

    const run = await client.internal.agent.runs.post(
      {
        assetIds: [],
        clientMessageId: "message_private_boundary",
        trigger: "user_message",
      },
      { headers: { authorization: `Bearer ${connectionData.grant}` } }
    )
    expect(run.error).toBeNull()
    expect(run.status).toBe(200)
    if (!run.data || "error" in run.data) throw new Error("Missing private run")
    expect(typeof run.data.expiresAt).toBe("string")
    expect(run.data).toMatchObject({
      attempt: 1,
      expiresAt: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      ),
      grant: expect.stringMatching(/^[A-Za-z0-9._~-]{32,512}$/),
      rootRunId: expect.any(String),
      runId: expect.any(String),
    })
  })

  it("is absent from the public app and public OpenAPI document", async () => {
    const { app } = await createFixture()

    const [getResponse, postResponse, openApiResponse] = await Promise.all([
      app.handle(
        new Request("http://localhost/internal/agent/context/account")
      ),
      app.handle(
        request("/internal/agent/connections/consume", {
          method: "POST",
          body: {},
        })
      ),
      app.handle(new Request("http://localhost/openapi/json")),
    ])

    expect(getResponse.status).toBe(404)
    expect(postResponse.status).toBe(404)
    expect(openApiResponse.status).toBe(200)
    expect(JSON.stringify(await openApiResponse.json())).not.toContain(
      "/internal/agent"
    )
  })

  it("requires strict bearer headers, rejects overposting, and consumes tickets once", async () => {
    const { db } = await createFixture()
    const internal = createAgentInternalApp(db)
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Private HTTP boundary",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      threadId: thread.id,
    })
    const internalRequest = (
      path: string,
      input: { body?: unknown; authorization?: string } = {}
    ) =>
      internal.handle(
        new Request(`http://agent-internal${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(input.authorization
              ? { authorization: input.authorization }
              : {}),
          },
          body: JSON.stringify(input.body ?? {}),
        })
      )

    const overpostedTicket = await internalRequest(
      "/internal/agent/connections/consume",
      {
        body: {
          ticket: ticket.ticket,
          threadId: thread.id,
          grant: "must-not-be-accepted",
        },
      }
    )
    expect(overpostedTicket.status).toBe(400)

    const consumed = await internalRequest(
      "/internal/agent/connections/consume",
      { body: { ticket: ticket.ticket, threadId: thread.id } }
    )
    expect(consumed.status).toBe(200)
    const connection: unknown = await consumed.json()
    const connectionGrant =
      connection && typeof connection === "object"
        ? Reflect.get(connection, "grant")
        : undefined
    expect(connectionGrant).toMatch(/^[A-Za-z0-9._~-]{32,512}$/)
    if (typeof connectionGrant !== "string") {
      throw new Error("Private connection did not return an opaque grant")
    }

    const replayed = await internalRequest(
      "/internal/agent/connections/consume",
      { body: { ticket: ticket.ticket, threadId: thread.id } }
    )
    expect(replayed.status).toBe(401)

    const runBody = {
      assetIds: [],
      clientMessageId: "private-http-message",
      trigger: "user_message" as const,
    }
    const missingBearer = await internalRequest("/internal/agent/runs", {
      body: runBody,
    })
    expect(missingBearer.status).toBe(401)

    const bodyGrant = await internalRequest("/internal/agent/runs", {
      authorization: `Bearer ${connectionGrant}`,
      body: { ...runBody, grant: connectionGrant },
    })
    expect(bodyGrant.status).toBe(400)

    const malformedBearer = await internalRequest("/internal/agent/runs", {
      authorization: `bearer ${connectionGrant}`,
      body: runBody,
    })
    expect(malformedBearer.status).toBe(401)

    const started = await internalRequest("/internal/agent/runs", {
      authorization: `Bearer ${connectionGrant}`,
      body: runBody,
    })
    expect(started.status).toBe(200)
    expect(await started.json()).toMatchObject({
      grant: expect.stringMatching(/^[A-Za-z0-9._~-]{32,512}$/),
      runId: expect.any(String),
    })
  })

  it("requires a bearer grant on every route except ticket consume/resume", async () => {
    const { db } = await createFixture()
    const internal = createAgentInternalApp(db)
    const protectedRequests = [
      { path: "/internal/agent/runs", body: { clientMessageId: "message_1" } },
      { path: "/internal/agent/runs/cancel", body: {} },
      {
        path: "/internal/agent/runs/finish",
        body: { outcome: "failed" },
      },
      {
        path: "/internal/agent/runs/messages",
        body: {
          messages: [
            {
              id: "assistant_1",
              role: "assistant",
              parts: [{ type: "text", text: "Done" }],
            },
          ],
        },
      },
      { path: "/internal/agent/context/account", method: "GET" },
      { path: "/internal/agent/context/organization", method: "GET" },
      { path: "/internal/agent/members", method: "GET" },
      { path: "/internal/agent/issue-labels", method: "GET" },
      { path: "/internal/agent/issues", method: "GET" },
      { path: "/internal/agent/issues/by-number/1", method: "GET" },
      { path: "/internal/agent/issues/agent-issue-a", method: "GET" },
      {
        path: "/internal/agent/actions",
        body: {
          kind: "create_issue",
          toolCallId: "tool_1",
          idempotencyKey: "idempotency_1",
          issue: { title: "Create securely" },
        },
      },
      { path: "/internal/agent/actions/action_1", method: "GET" },
      { path: "/internal/agent/actions/action_1/execute", body: {} },
      { path: "/internal/agent/assets/asset_1/model", method: "GET" },
    ]

    const responses = await Promise.all(
      protectedRequests.map(({ body, method = "POST", path }) =>
        internal.handle(
          new Request(`http://agent-internal${path}`, {
            method,
            headers: { "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          })
        )
      )
    )
    expect(responses.map(({ status }) => status)).toEqual(
      Array.from({ length: protectedRequests.length }, () => 401)
    )
  })
})

describe("Agent internal capability repository", () => {
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
