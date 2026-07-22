import type { AgentInternalFetchBinding } from "@enterprise-agentic-saas/api/agent-client"
import { describe, expect, it } from "vitest"

import {
  AgentInternalControlError,
  createAgentInternalGateway,
  toAgentControlFailure,
} from "./client"

const CONNECTION_TICKET = "ticket_0123456789abcdefghijklmnopqrstuvwxyz"
const CONNECTION_GRANT = "connection_0123456789abcdefghijklmnopqrstuv"
const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"
const RESUME_TICKET = "resume_0123456789abcdefghijklmnopqrstuvwxyz"

const responseFor = (request: Request): Response => {
  const path = new URL(request.url).pathname
  if (path.endsWith("/connections/consume")) {
    return Response.json({
      expiresAt: "2999-07-22T00:00:00.000Z",
      grant: CONNECTION_GRANT,
      organization: {
        name: "Organization",
        permissions: {
          canCreateIssues: true,
          canDeleteAnyIssue: true,
          canDeleteOwnIssues: true,
          canReadIssues: true,
          canUpdateIssues: true,
        },
        role: "super_admin",
        slug: "organization",
      },
      thread: { id: "thread_1", title: "Thread" },
      user: { name: "User", profileImage: null },
    })
  }
  if (path.endsWith("/runs") || path.endsWith("/resume")) {
    return Response.json({
      attempt: 1,
      expiresAt: "2999-07-22T00:00:00.000Z",
      grant: RUN_GRANT,
      rootRunId: "root_1",
      runId: "run_1",
    })
  }
  if (path.endsWith("/model")) {
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/webp" },
    })
  }
  return Response.json([])
}

const harness = () => {
  const requests: Array<
    Promise<{
      body: string
      headers: Record<string, string>
      method: string
      url: string
    }>
  > = []
  const binding: AgentInternalFetchBinding = {
    fetch(input) {
      expect(input).toBeInstanceOf(Request)
      if (!(input instanceof Request)) {
        throw new TypeError("Service Binding input must be a Request")
      }
      const request = input
      const captured = request.clone()
      requests.push(
        captured.text().then((body) => ({
          body,
          headers: Object.fromEntries(captured.headers),
          method: captured.method,
          url: captured.url,
        }))
      )
      return Promise.resolve(responseFor(request))
    },
  }
  return { gateway: createAgentInternalGateway(binding), requests }
}

describe("Agent internal HTTP gateway", () => {
  it("uses ticket bodies only for consume/resume and bearer headers elsewhere", async () => {
    const test = harness()

    await test.gateway.consumeConnectionTicket({
      ticket: CONNECTION_TICKET,
      threadId: "thread_1",
    })
    await test.gateway.startRun({
      clientMessageId: "message_1",
      grant: CONNECTION_GRANT,
    })
    await test.gateway.searchIssues({
      grant: RUN_GRANT,
      limit: 20,
      status: "open",
    })
    await test.gateway.resumeApprovedAction({
      actionId: "action_1",
      resumeTicket: RESUME_TICKET,
    })
    const image = await test.gateway.getAgentImageForModel({
      assetId: "asset_1",
      grant: RUN_GRANT,
    })
    const requests = await Promise.all(test.requests)

    expect(requests).toHaveLength(5)
    expect(requests[0]?.headers.authorization).toBeUndefined()
    expect(JSON.parse(requests[0]?.body ?? "null")).toEqual({
      threadId: "thread_1",
      ticket: CONNECTION_TICKET,
    })

    expect(requests[1]?.headers.authorization).toBe(
      `Bearer ${CONNECTION_GRANT}`
    )
    expect(JSON.parse(requests[1]?.body ?? "null")).toEqual({
      assetIds: [],
      clientMessageId: "message_1",
      estimatedInputTokenCount: 0,
      trigger: "user_message",
    })

    const issueUrl = new URL(requests[2]?.url ?? "")
    expect(issueUrl.pathname).toBe("/internal/agent/issues")
    expect(Object.fromEntries(issueUrl.searchParams)).toEqual({
      limit: "20",
      status: "open",
    })
    expect(issueUrl.search).not.toContain("grant")
    expect(issueUrl.search).not.toContain("undefined")
    expect(requests[2]?.headers.authorization).toBe(`Bearer ${RUN_GRANT}`)

    expect(requests[3]?.headers.authorization).toBeUndefined()
    expect(JSON.parse(requests[3]?.body ?? "null")).toEqual({
      resumeTicket: RESUME_TICKET,
    })
    expect(new URL(requests[3]?.url ?? "").pathname).toBe(
      "/internal/agent/actions/action_1/resume"
    )

    expect(requests[4]?.headers.authorization).toBe(`Bearer ${RUN_GRANT}`)
    expect(new URL(requests[4]?.url ?? "").pathname).toBe(
      "/internal/agent/assets/asset_1/model"
    )
    expect(image.headers.get("content-type")).toBe("image/webp")
  })

  it("does not copy private error bodies or grants into Agent errors", async () => {
    const binding: AgentInternalFetchBinding = {
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { message: `private ${RUN_GRANT}` } },
            { status: 401 }
          )
        ),
    }
    const gateway = createAgentInternalGateway(binding)

    let caught: unknown
    try {
      await gateway.readAccountContext({ grant: RUN_GRANT })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(String(caught)).toContain("Agent internal capability is unavailable")
    expect(String(caught)).not.toContain(RUN_GRANT)
  })

  it.each([
    { status: 409 as const, retryAfter: null, header: null },
    { status: 429 as const, retryAfter: 37, header: "37" },
    { status: 429 as const, retryAfter: 1, header: "unsafe" },
  ])(
    "preserves only safe control metadata for internal $status responses",
    async ({ header, retryAfter, status }) => {
      const binding: AgentInternalFetchBinding = {
        fetch: () =>
          Promise.resolve(
            Response.json(
              { error: { message: `private ${RUN_GRANT}` } },
              {
                status,
                headers: header === null ? {} : { "retry-after": header },
              }
            )
          ),
      }
      const gateway = createAgentInternalGateway(binding)

      let caught: unknown
      try {
        await gateway.startRun({
          clientMessageId: "message_control_error",
          grant: CONNECTION_GRANT,
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(AgentInternalControlError)
      expect(caught).toMatchObject({ status, retryAfter })
      expect(toAgentControlFailure(caught)).toEqual(
        status === 409
          ? {
              body: "Agent run already in progress",
              retryAfter: null,
              status: 409,
            }
          : {
              body: "Agent capacity temporarily limited",
              retryAfter,
              status: 429,
            }
      )
      expect(String(caught)).not.toContain(RUN_GRANT)
      expect(JSON.stringify(caught)).not.toContain(RUN_GRANT)
    }
  )
})
