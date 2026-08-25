import { agentThreadSchema } from "@enterprise-agentic-saas/agent-contracts"
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
import { configureAgentRuntime } from "./runtime"

describe("Agent公開control plane", () => {
  it("未paginationのthread一覧が公開上限を超えた場合はfail closedにする", async () => {
    const { app, db } = await createFixture()
    const now = new Date()
    await db.insert(schema.agentThreads).values(
      Array.from({ length: 1_001 }, (_, index) => ({
        id: `agent-thread-${index}`,
        organizationId: "agent-org-a",
        ownerUserId: "agent-user-a",
        createdAt: now,
      }))
    )

    const response = await app.handle(request("/agent/threads"))

    expect(response.status).toBe(503)
    expect(response.headers.get("retry-after")).toBe("30")
    expect(await response.json()).toEqual({
      error: "service_unavailable",
      message: "The service is temporarily unavailable.",
    })
  })

  it.each([
    {
      body: { permissionMode: "full_access" },
      expectedMode: "full_access",
      expectedSessionId: "agent-session-a",
      expectedUserId: "agent-user-a",
      label: "明示したfull_access",
      sessionId: undefined,
      userId: undefined,
    },
    {
      body: {},
      expectedMode: "ask_always",
      expectedSessionId: "agent-session-a",
      expectedUserId: "agent-user-a",
      label: "省略時のask_always",
      sessionId: undefined,
      userId: undefined,
    },
    {
      body: { permissionMode: "full_access" },
      expectedMode: "full_access",
      expectedSessionId: "agent-session-b",
      expectedUserId: "agent-user-b",
      label: "別sessionのfull_access",
      sessionId: "agent-session-b",
      userId: "agent-user-b",
    },
  ] as const)(
    "$labelをthread transaction内の初期permissionへ保存する",
    async ({
      body,
      expectedMode,
      expectedSessionId,
      expectedUserId,
      sessionId,
      userId,
    }) => {
      const { app, db } = await createFixture()
      const response = await app.handle(
        request("/agent/threads", {
          method: "POST",
          body,
          ...(sessionId ? { sessionId } : {}),
          ...(userId ? { userId } : {}),
        })
      )

      expect(response.status).toBe(201)
      const thread = v.parse(agentThreadSchema, await response.json())
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
      expect(permissions).toEqual([
        {
          contextEpoch: 1,
          mode: expectedMode,
          organizationId: "agent-org-a",
          sessionId: expectedSessionId,
          threadId: thread.id,
          userId: expectedUserId,
        },
      ])
    }
  )

  it("不正なpermission modeでthreadを作らない", async () => {
    const { app, db } = await createFixture()
    const invalidResponse = await app.handle(
      request("/agent/threads", {
        method: "POST",
        body: { permissionMode: "owner" },
      })
    )
    expect(invalidResponse.status).toBe(400)
    expect(await db.select().from(schema.agentThreads)).toEqual([])
  })

  it("初期permission保存失敗時にthread transactionをrollbackする", async () => {
    const { app, db } = await createFixture()
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
    expect(await db.select().from(schema.agentThreads)).toEqual([])
    expect(await db.select().from(schema.agentThreadPermissions)).toEqual([])
  })

  it("private runのprepare前に信頼済みCSRF Originを要求する", async () => {
    const { app } = await createFixture()
    const inputs = configureAgentStreamCapture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadSchema, await createdResponse.json())
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
      error: "csrf_origin_forbidden",
    })
    expect(inputs).toEqual([])
  })

  it("公開境界で旧Web検索digest suffixを拒否する", async () => {
    const { app } = await createFixture()
    const inputs = configureAgentStreamCapture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadSchema, await createdResponse.json())
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

  it.each([
    {
      expectedBody: {
        error: "conflict",
        message: "The request conflicts with the current state.",
      },
      expectedRetryAfter: null,
      label: "競合応答",
      retryAfter: "99999",
      status: 409,
    },
    {
      expectedBody: {
        error: "rate_limited",
        message: "Too many requests. Try again later.",
      },
      expectedRetryAfter: "37",
      label: "流量制限応答",
      retryAfter: "37",
      status: 429,
    },
  ] as const)(
    "$labelへ上限付きrun control statusだけを転送する",
    async ({ expectedBody, expectedRetryAfter, retryAfter, status }) => {
      const { app } = await createFixture()
      const createdResponse = await app.handle(
        request("/agent/threads", { method: "POST", body: {} })
      )
      const thread = v.parse(agentThreadSchema, await createdResponse.json())
      const privateBody = "private database detail sk-secret-value"
      const runtimeRequestIds: string[] = []
      configureAgentRuntime({
        fetch: (input) => {
          if (!(input instanceof Request)) {
            throw new TypeError("Expected an Agent runtime Request")
          }
          runtimeRequestIds.push(input.headers.get("x-request-id") ?? "")
          return Promise.resolve(
            new Response(privateBody, {
              status,
              headers: { "retry-after": retryAfter },
            })
          )
        },
      })

      const response = await app.handle(
        request("/agent/chat", {
          method: "POST",
          body: {
            threadId: thread.id,
            messageId: `message_control_${status}`,
            contentSegments: [{ type: "text", text: "Retry this message" }],
            assetIds: [],
            timezone: "Asia/Tokyo",
          },
        })
      )
      expect(response.status).toBe(status)
      expect(runtimeRequestIds[0]).toBe(response.headers.get("x-request-id"))
      expect(response.headers.get("retry-after")).toBe(expectedRetryAfter)
      const body = await response.json()
      expect(body).toEqual(expectedBody)
      expect(JSON.stringify(body)).not.toContain(privateBody)
    }
  )

  it.each([
    { label: "別owner", mode: "other-owner" },
    { label: "別tenant", mode: "other-tenant" },
  ] as const)("$labelのthread archiveへnot-foundを返す", async ({ mode }) => {
    const { app, db } = await createFixture()

    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    expect(createdResponse.status).toBe(201)
    const created = v.parse(agentThreadSchema, await createdResponse.json())
    expect(created.title).toBe("New conversation")

    if (mode === "other-tenant") {
      await db.insert(schema.agentThreads).values({
        id: "agent-thread-other-org",
        organizationId: "agent-org-b",
        ownerUserId: "agent-user-a",
      })
    }
    const response = await app.handle(
      request(
        `/agent/threads/${mode === "other-owner" ? created.id : "agent-thread-other-org"}/archive`,
        {
          method: "POST",
          body: {},
          ...(mode === "other-owner"
            ? { userId: "agent-user-b", sessionId: "agent-session-b" }
            : {}),
        }
      )
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: "not_found" })
  })

  it("ownerがthreadをarchiveすると一覧から除外する", async () => {
    const { app } = await createFixture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const created = v.parse(agentThreadSchema, await createdResponse.json())
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

  it("最新user messageだけを受理してprivate ticketをresponseへ含めない", async () => {
    const { app } = await createFixture()
    const inputs = configureAgentStreamCapture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadSchema, await createdResponse.json())

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
  })

  it("旧message bodyのoverpostingをruntime開始前に拒否する", async () => {
    const { app } = await createFixture()
    const inputs = configureAgentStreamCapture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadSchema, await createdResponse.json())
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
    expect(inputs).toEqual([])
  })

  it("runtime開始前にテナントをまたぐinline mentionを拒否する", async () => {
    const { app } = await createFixture()
    const inputs = configureAgentStreamCapture()
    const createdResponse = await app.handle(
      request("/agent/threads", { method: "POST", body: {} })
    )
    const thread = v.parse(agentThreadSchema, await createdResponse.json())

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
