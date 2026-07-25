import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createAgentInternalClient } from "../../agent-client"
import { createFixture, request } from "./agent.test-support"
import { createAgentInternalApp } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
  prepareAgentChatForSession,
} from "./threads/repository"

describe("Agent private HTTP boundary", () => {
  it("compacts context deterministically above 95% and keeps the latest 12 messages", async () => {
    const { db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Compaction boundary",
    })
    const largeOutput = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `field_${index}`,
        "x".repeat(9_500),
      ])
    )
    await db.insert(schema.agentMessages).values(
      Array.from({ length: 34 }, (_, index) => ({
        id: `compaction-message-${index}`,
        organizationId: "agent-org-a",
        threadId: thread.id,
        clientMessageId: null,
        role: "assistant" as const,
        content: {
          parts: [
            {
              type: "tool-search_issues" as const,
              toolCallId: `compaction-call-${index}`,
              state: "output-available" as const,
              input: {},
              output: largeOutput,
            },
          ],
        },
      }))
    )
    const input = {
      assetIds: [],
      contentSegments: [
        { type: "text" as const, text: "Continue from the summary" },
      ],
      messageId: "compaction-user-message",
      sessionId: "agent-session-a",
      threadId: thread.id,
      timezone: "Asia/Tokyo",
      userId: "agent-user-a",
    }

    const first = await prepareAgentChatForSession(db, input)
    const repeated = await prepareAgentChatForSession(db, input)

    expect(first.messages).toHaveLength(13)
    expect(first.messages[0]).toMatchObject({
      role: "assistant",
      parts: [
        {
          type: "text",
          text: expect.stringContaining("Earlier conversation summary"),
        },
      ],
    })
    expect(repeated.messages[0]?.id).toBe(first.messages[0]?.id)
    const summaries = await db
      .select({
        throughSequence: schema.agentThreadContextSummaries.throughSequence,
      })
      .from(schema.agentThreadContextSummaries)
      .where(eq(schema.agentThreadContextSummaries.threadId, thread.id))
    expect(summaries).toHaveLength(1)
  })

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
        estimatedInputTokenCount: 12_345,
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
    const [snapshot] = await db
      .select({
        modelProfileId: schema.agentRuns.modelProfileId,
        contextWindowTokenCount: schema.agentRuns.contextWindowTokenCount,
        estimatedInputTokenCount: schema.agentRuns.estimatedInputTokenCount,
        reservedOutputTokenCount: schema.agentRuns.reservedOutputTokenCount,
      })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, run.data.runId))
    expect(snapshot).toEqual({
      modelProfileId: "openrouter-qwen3.6-flash",
      contextWindowTokenCount: 1_000_000,
      estimatedInputTokenCount: 12_345,
      reservedOutputTokenCount: 4_096,
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
