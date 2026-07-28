import * as schema from "@enterprise-agentic-saas/db/schema"
import { sql } from "drizzle-orm"
import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  configureAgentStreamCapture,
  createFixture,
  headers,
  request,
} from "./agent.test-support"
import { agentThreadModel } from "./model"
import { configureAgentRuntime } from "./runtime"

describe("Agent public control plane", () => {
  it("creates the initial thread permission in the thread transaction", async () => {
    const { app, db } = await createFixture()
    const fullAccessResponse = await app.handle(
      request("/agent/threads", {
        method: "POST",
        body: { permissionMode: "full_access" },
      })
    )
    expect(fullAccessResponse.status).toBe(201)
    const fullAccessThread = v.parse(
      agentThreadModel,
      await fullAccessResponse.json()
    )
    const defaultResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    expect(defaultResponse.status).toBe(201)
    const defaultThread = v.parse(
      agentThreadModel,
      await defaultResponse.json()
    )
    const otherSessionResponse = await app.handle(
      request("/agent/threads", {
        method: "POST",
        body: { permissionMode: "full_access" },
        userId: "agent-user-b",
        sessionId: "agent-session-b",
      })
    )
    expect(otherSessionResponse.status).toBe(201)
    const otherSessionThread = v.parse(
      agentThreadModel,
      await otherSessionResponse.json()
    )

    const permissions = await db
      .select({
        contextEpoch: schema.agentThreadPermissions.contextEpoch,
        mode: schema.agentThreadPermissions.mode,
        organizationId: schema.agentThreadPermissions.organizationId,
        sessionId: schema.agentThreadPermissions.sessionId,
        threadId: schema.agentThreadPermissions.threadId,
        userId: schema.agentThreadPermissions.userId,
      })
      .from(schema.agentThreadPermissions)
    expect(permissions).toEqual(
      expect.arrayContaining([
        {
          contextEpoch: 1,
          mode: "full_access",
          organizationId: "agent-org-a",
          sessionId: "agent-session-a",
          threadId: fullAccessThread.id,
          userId: "agent-user-a",
        },
        {
          contextEpoch: 1,
          mode: "ask_always",
          organizationId: "agent-org-a",
          sessionId: "agent-session-a",
          threadId: defaultThread.id,
          userId: "agent-user-a",
        },
        {
          contextEpoch: 1,
          mode: "full_access",
          organizationId: "agent-org-a",
          sessionId: "agent-session-b",
          threadId: otherSessionThread.id,
          userId: "agent-user-b",
        },
      ])
    )

    const invalidResponse = await app.handle(
      request("/agent/threads", {
        method: "POST",
        body: { permissionMode: "owner" },
      })
    )
    expect(invalidResponse.status).toBe(400)
    expect(await db.select().from(schema.agentThreads)).toHaveLength(3)

    await db.run(sql`
      create trigger fail_initial_agent_permission
      before insert on agent_thread_permissions
      begin
        select raise(abort, 'initial_agent_permission_failure');
      end
    `)
    const failedResponse = await app.handle(
      request("/agent/threads", {
        method: "POST",
        body: { permissionMode: "full_access" },
      })
    )
    expect(failedResponse.status).toBe(500)
    expect(await db.select().from(schema.agentThreads)).toHaveLength(3)
    expect(await db.select().from(schema.agentThreadPermissions)).toHaveLength(
      3
    )
  })

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
          messageId: "message_missing_origin",
          contentSegments: [{ type: "text", text: "Do not start" }],
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

  it("rejects the legacy Web-search digest suffix at the public boundary", async () => {
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
          messageId:
            "forged_q_269294520791217599232f5d56c3e8ee7f5c79b50134cf82",
          contentSegments: [
            { type: "text", text: "Cloudflare R2 current limits" },
          ],
          assetIds: [],
          timezone: "Asia/Tokyo",
        },
      })
    )

    expect(response.status).toBe(400)
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
          messageId: "message_control_conflict",
          contentSegments: [{ type: "text", text: "Retry this message" }],
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
          messageId: "message_control_limited",
          contentSegments: [
            { type: "text", text: "Try when capacity is ready" },
          ],
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
          messageId: "message_public_1",
          contentSegments: [
            { type: "text", text: "Create an Issue for " },
            {
              type: "context_reference",
              reference: { kind: "issue", id: "agent-issue-a" },
            },
            { type: "text", text: " from " },
            {
              type: "context_reference",
              reference: {
                kind: "current_page",
                path: "/organization/agent-org-a/issues/1?from=agent",
              },
            },
          ],
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
      contextReferences: [
        {
          kind: "issue",
          id: "agent-issue-a",
          number: 1,
          title: "Fix API boundary",
          description: "Keep the tenant projection minimal",
          status: "open",
          priority: "high",
        },
        {
          kind: "current_page",
          path: "/organization/agent-org-a/issues/1",
          title: "Issue #1: Fix API boundary",
        },
      ],
      threadId: thread.id,
      timezone: "Asia/Tokyo",
      trigger: "user_message",
    })
    expect(inputs[0]?.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const history = await app.handle(
      request(`/agent/threads/${thread.id}/messages`)
    )
    expect(history.status).toBe(200)
    expect(await history.json()).toEqual({
      hasMore: false,
      messages: [
        {
          id: "message_public_1",
          role: "user",
          parts: [
            { type: "text", text: "Create an Issue for " },
            {
              type: "data-context-reference",
              data: {
                kind: "issue",
                id: "agent-issue-a",
                label: "Issue #1: Fix API boundary",
              },
            },
            { type: "text", text: " from " },
            {
              type: "data-context-reference",
              data: {
                kind: "current_page",
                path: "/organization/agent-org-a/issues/1",
                label: "Issue #1: Fix API boundary",
              },
            },
          ],
        },
      ],
      page: 0,
      perPage: 40,
      total: 1,
    })
    const threads = await app.handle(request("/agent/threads"))
    expect(await threads.json()).toEqual([
      expect.objectContaining({ id: thread.id, title: "New conversation" }),
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

  it("rejects a cross-tenant inline mention before starting the runtime", async () => {
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
          messageId: "message_cross_tenant_mention",
          contentSegments: [
            { type: "text", text: "Read " },
            {
              type: "context_reference",
              reference: { kind: "issue", id: "agent-issue-b" },
            },
          ],
          assetIds: [],
          timezone: "Asia/Tokyo",
        },
      })
    )

    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain("Other tenant issue")
    expect(inputs).toEqual([])
  })
})
