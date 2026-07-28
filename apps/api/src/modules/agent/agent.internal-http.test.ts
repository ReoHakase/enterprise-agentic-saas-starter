import { describe, expect, it } from "vitest"

import { createAgentInternalClient } from "../../agent-client"
import { createFixture } from "./agent.test-support"
import { createAgentInternalApp } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

const privateRequest = (
  app: ReturnType<typeof createAgentInternalApp>,
  path: string,
  input: {
    authorization?: string
    body?: unknown
    method?: string
  } = {}
) =>
  app.handle(
    new Request(`https://agent-internal.invalid${path}`, {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers: {
        "content-type": "application/json",
        ...(input.authorization ? { authorization: input.authorization } : {}),
      },
      method: input.method ?? "POST",
    })
  )

describe("Agent private HTTP boundary", () => {
  it("uses a Request-only Service Binding fetch boundary", async () => {
    const { db } = await createFixture()
    const app = createAgentInternalApp(db)
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Fetch boundary",
      userId: "agent-user-a",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    let observed: Request | undefined
    const client = createAgentInternalClient({
      fetch(request) {
        if (!(request instanceof Request)) {
          throw new TypeError("Service Binding input must be a Request")
        }
        observed = request
        return Promise.resolve(app.handle(request))
      },
    })

    const response = await client.internal.agent.connections.consume.post({
      threadId: thread.id,
      ticket: ticket.ticket,
    })

    expect(observed).toBeInstanceOf(Request)
    expect(response.status).toBe(200)
    expect(response.data).toMatchObject({
      grant: expect.stringMatching(/^[A-Za-z0-9._~-]{32,512}$/u),
      thread: { id: thread.id },
    })
  })

  it("rejects overposting, body grants, and malformed bearer headers", async () => {
    const { db } = await createFixture()
    const app = createAgentInternalApp(db)
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      title: "Strict boundary",
      userId: "agent-user-a",
    })
    const ticket = await issueAgentConnectionTicket(db, {
      sessionId: "agent-session-a",
      threadId: thread.id,
      userId: "agent-user-a",
    })
    expect(
      (
        await privateRequest(app, "/internal/agent/connections/consume", {
          body: {
            grant: "overposted",
            threadId: thread.id,
            ticket: ticket.ticket,
          },
        })
      ).status
    ).toBe(400)
    const consumed = await privateRequest(
      app,
      "/internal/agent/connections/consume",
      { body: { threadId: thread.id, ticket: ticket.ticket } }
    )
    const connection: unknown = await consumed.json()
    const grant =
      connection && typeof connection === "object"
        ? Reflect.get(connection, "grant")
        : undefined
    if (typeof grant !== "string") throw new Error("Missing connection grant")
    const body = {
      assetIds: [],
      clientMessageId: "message_http",
      estimatedInputTokenCount: 10,
      trigger: "user_message",
    }
    expect(
      (
        await privateRequest(app, "/internal/agent/runs", {
          authorization: `bearer ${grant}`,
          body,
        })
      ).status
    ).toBe(401)
    expect(
      (
        await privateRequest(app, "/internal/agent/runs", {
          authorization: `Bearer ${grant}`,
          body: { ...body, grant },
        })
      ).status
    ).toBe(400)
  })

  it("requires authorization on every protected private route", async () => {
    const { db } = await createFixture()
    const app = createAgentInternalApp(db)
    const requests = [
      ["/internal/agent/runs", "POST", { clientMessageId: "message_1" }],
      ["/internal/agent/runs/web-search/reserve", "POST", {}],
      ["/internal/agent/runs/web-search/guard", "POST", {}],
      ["/internal/agent/runs/cancel", "POST", {}],
      ["/internal/agent/runs/finish", "POST", { outcome: "failed" }],
      ["/internal/agent/runs/usage", "POST", {}],
      ["/internal/agent/context/account", "GET"],
      ["/internal/agent/context/organization", "GET"],
      ["/internal/agent/members?limit=20&query=x", "GET"],
      ["/internal/agent/issue-labels?limit=20&query=x", "GET"],
      ["/internal/agent/issues?limit=20", "GET"],
      ["/internal/agent/issues/by-number/1", "GET"],
      ["/internal/agent/issues/agent-issue-a", "GET"],
      ["/internal/agent/issues/agent-issue-a/attachments/file_1/model", "GET"],
      ["/internal/agent/actions", "POST", {}],
      ["/internal/agent/actions/action_1", "GET"],
      ["/internal/agent/actions/action_1/execute", "POST", {}],
      ["/internal/agent/assets/asset_1/model", "GET"],
    ] as const
    const responses = await Promise.all(
      requests.map(([path, method, body]) =>
        privateRequest(app, path, { body, method })
      )
    )
    expect(responses.map(({ status }) => status)).toEqual(
      requests.map(() => 401)
    )
  })
})
