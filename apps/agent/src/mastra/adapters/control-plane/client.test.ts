import type { AgentInternalFetchBinding } from "@enterprise-agentic-saas/agent-contracts"
import { describe, expect, it } from "vitest"

import {
  AgentInternalControlError,
  createAgentInternalGateway,
  toAgentControlFailure,
  type AgentInternalGateway,
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
      memoryResourceId: "resource_1",
      organization: {
        name: "Organization",
        permissions: {
          canCreateIssues: true,
          canDeleteAnyIssue: true,
          canDeleteOwnIssues: true,
          canReadIssues: true,
          canUpdateIssues: true,
        },
        role: "owner",
        slug: "organization",
      },
      thread: { id: "thread_1", title: "Thread" },
      user: { name: "User", profileImage: null },
    })
  }
  if (path.endsWith("/runs/start")) {
    return Response.json({
      memoryResourceId: "resource_1",
      organization: {
        name: "Organization",
        permissions: {
          canCreateIssues: true,
          canDeleteAnyIssue: true,
          canDeleteOwnIssues: true,
          canReadIssues: true,
          canUpdateIssues: true,
        },
        role: "owner",
        slug: "organization",
      },
      run: {
        attempt: 1,
        expiresAt: "2999-07-22T00:00:00.000Z",
        grant: RUN_GRANT,
        rootRunId: "root_1",
        runId: "run_1",
        shouldGenerateTitle: false,
      },
      thread: { id: "thread_1", title: "Thread" },
      user: { name: "User", profileImage: null },
    })
  }
  if (path.endsWith("/resume")) {
    return Response.json({
      attempt: 1,
      expiresAt: "2999-07-22T00:00:00.000Z",
      grant: RUN_GRANT,
      rootRunId: "root_1",
      runId: "run_1",
      shouldGenerateTitle: false,
    })
  }
  if (path.endsWith("/runs/live")) return Response.json({ live: true })
  if (path.endsWith("/runs/web-search/authorize")) {
    return Response.json({ query: "query", reserved: true, reused: false })
  }
  if (path.endsWith("/runs/finalize")) {
    return Response.json({ runId: "run_1", status: "completed" })
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
  it("uses ticket bodies only for connection/start/resume and bearer headers elsewhere", async () => {
    const test = harness()

    await test.gateway.consumeConnectionTicket({
      ticket: CONNECTION_TICKET,
      threadId: "thread_1",
    })
    await test.gateway.startChatRun({
      clientMessageId: "message_1",
      ticket: CONNECTION_TICKET,
      threadId: "thread_1",
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
    const issueImage = await test.gateway.getIssueAttachmentImageForModel({
      fileId: "file_1",
      grant: RUN_GRANT,
      issueId: "issue_1",
    })
    const requests = await Promise.all(test.requests)

    expect(requests).toHaveLength(6)
    expect(requests[0]?.headers.authorization).toBeUndefined()
    expect(JSON.parse(requests[0]?.body ?? "null")).toEqual({
      threadId: "thread_1",
      ticket: CONNECTION_TICKET,
    })

    expect(requests[1]?.headers.authorization).toBeUndefined()
    expect(JSON.parse(requests[1]?.body ?? "null")).toEqual({
      assetIds: [],
      clientMessageId: "message_1",
      estimatedInputTokenCount: 0,
      threadId: "thread_1",
      ticket: CONNECTION_TICKET,
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
    expect(requests[5]?.headers.authorization).toBe(`Bearer ${RUN_GRANT}`)
    expect(new URL(requests[5]?.url ?? "").pathname).toBe(
      "/internal/agent/issues/issue_1/attachments/file_1/model"
    )
    expect(issueImage.headers.get("content-type")).toBe("image/webp")
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

  it("preserves the original response stream failure as Error.cause", async () => {
    const cause = new Error("private response stream failure")
    const binding: AgentInternalFetchBinding = {
      fetch: () =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(cause)
              },
            })
          )
        ),
    }

    let caught: unknown
    try {
      await createAgentInternalGateway(binding).readAccountContext({
        grant: RUN_GRANT,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    if (!(caught instanceof Error)) throw new Error("Expected transport error")
    expect(caught.cause).toBe(cause)
    expect(String(caught)).not.toContain(cause.message)
  })
})

describe("Agent internal response contracts", () => {
  it.each([
    [
      "account",
      (gateway: AgentInternalGateway) =>
        gateway.readAccountContext({ grant: RUN_GRANT }),
    ],
    [
      "organization",
      (gateway: AgentInternalGateway) =>
        gateway.readActiveOrganization({ grant: RUN_GRANT }),
    ],
    [
      "member",
      (gateway: AgentInternalGateway) =>
        gateway.searchOrganizationMembers({ grant: RUN_GRANT }),
    ],
    [
      "Issue",
      (gateway: AgentInternalGateway) =>
        gateway.getIssue({
          grant: RUN_GRANT,
          lookup: "id",
          id: "issue_1",
        }),
    ],
    [
      "connection",
      (gateway: AgentInternalGateway) =>
        gateway.consumeConnectionTicket({
          ticket: CONNECTION_TICKET,
          threadId: "thread_1",
        }),
    ],
    [
      "chat run",
      (gateway: AgentInternalGateway) =>
        gateway.startChatRun({
          clientMessageId: "message_1",
          ticket: CONNECTION_TICKET,
          threadId: "thread_1",
        }),
    ],
    [
      "run liveness",
      (gateway: AgentInternalGateway) =>
        gateway.assertRunLive({ grant: RUN_GRANT }),
    ],
    [
      "Web search authorization",
      (gateway: AgentInternalGateway) =>
        gateway.authorizeWebSearch({
          grant: RUN_GRANT,
          operationId: "operation_1",
          query: "query",
        }),
    ],
    [
      "finalized run",
      (gateway: AgentInternalGateway) =>
        gateway.finalizeRun({ grant: RUN_GRANT, outcome: "completed" }),
    ],
    [
      "Issue labels",
      (gateway: AgentInternalGateway) =>
        gateway.searchIssueLabels({ grant: RUN_GRANT, limit: 20 }),
    ],
    [
      "Issue list",
      (gateway: AgentInternalGateway) =>
        gateway.searchIssues({ grant: RUN_GRANT, limit: 20 }),
    ],
    [
      "prepared create action",
      (gateway: AgentInternalGateway) =>
        gateway.prepareCreateIssue({
          grant: RUN_GRANT,
          idempotencyKey: "idempotency_1",
          issue: { title: "Issue" },
          toolCallId: "tool_1",
        }),
    ],
    [
      "prepared update action",
      (gateway: AgentInternalGateway) =>
        gateway.prepareUpdateIssue({
          grant: RUN_GRANT,
          idempotencyKey: "idempotency_1",
          issue: { expectedRevision: 1, issueId: "issue_1", title: "Issue" },
          toolCallId: "tool_1",
        }),
    ],
    [
      "prepared delete action",
      (gateway: AgentInternalGateway) =>
        gateway.prepareDeleteIssue({
          grant: RUN_GRANT,
          idempotencyKey: "idempotency_1",
          issue: { expectedRevision: 1, issueId: "issue_1" },
          toolCallId: "tool_1",
        }),
    ],
    [
      "action",
      (gateway: AgentInternalGateway) =>
        gateway.executeApprovedAction({
          actionId: "action_1",
          grant: RUN_GRANT,
        }),
    ],
    [
      "resumed action",
      (gateway: AgentInternalGateway) =>
        gateway.resumeApprovedAction({
          actionId: "action_1",
          resumeTicket: RESUME_TICKET,
        }),
    ],
    [
      "finalized run with usage",
      (gateway: AgentInternalGateway) =>
        gateway.finalizeRun({
          grant: RUN_GRANT,
          outcome: "completed",
          usage: {
            provider: "openrouter",
            model: "model",
            inputTokenCount: 1,
            inputNoCacheTokenCount: 1,
            cacheReadTokenCount: 0,
            cacheWriteTokenCount: 0,
            outputTokenCount: 1,
            textOutputTokenCount: 1,
            reasoningTokenCount: 0,
            totalTokenCount: 2,
            imageInputCount: 0,
            durationMs: 1,
            runEventId: "event_1",
          },
        }),
    ],
  ])(
    "rejects unknown or private fields in %s responses",
    async (_name, invoke) => {
      const privateValue = "https://private.invalid/resource"
      const caughtValues = await Promise.all(
        [{ privateUrl: privateValue }, { status: 42, type: "invalid" }].map(
          async (body) => {
            const binding: AgentInternalFetchBinding = {
              fetch: () => Promise.resolve(Response.json(body)),
            }
            try {
              await invoke(createAgentInternalGateway(binding))
            } catch (error) {
              return error
            }
            return undefined
          }
        )
      )
      for (const caught of caughtValues) {
        expect(caught).toBeInstanceOf(Error)
        expect(String(caught)).toContain(
          "Agent internal capability is unavailable"
        )
        expect(String(caught)).not.toContain(privateValue)
        expect(String(caught)).not.toContain(RUN_GRANT)
      }
    }
  )

  it.each([
    [
      "account",
      (gateway: AgentInternalGateway) =>
        gateway.readAccountContext({ grant: RUN_GRANT }),
      { name: "User", profileImage: null },
    ],
    [
      "organization",
      (gateway: AgentInternalGateway) =>
        gateway.readActiveOrganization({ grant: RUN_GRANT }),
      {
        name: "Organization",
        permissions: {
          canCreateIssues: true,
          canDeleteAnyIssue: false,
          canDeleteOwnIssues: true,
          canReadIssues: true,
          canUpdateIssues: true,
        },
        role: "member",
        slug: "organization",
      },
    ],
    [
      "member list",
      (gateway: AgentInternalGateway) =>
        gateway.searchOrganizationMembers({ grant: RUN_GRANT, limit: 20 }),
      [{ id: "member_1", name: "Member", profileImage: null, role: "member" }],
    ],
    [
      "connection",
      (gateway: AgentInternalGateway) =>
        gateway.consumeConnectionTicket({
          ticket: CONNECTION_TICKET,
          threadId: "thread_1",
        }),
      {
        expiresAt: "2999-07-22T00:00:00.000Z",
        grant: CONNECTION_GRANT,
        memoryResourceId: "resource_1",
        organization: {
          name: "Organization",
          permissions: {
            canCreateIssues: true,
            canDeleteAnyIssue: true,
            canDeleteOwnIssues: true,
            canReadIssues: true,
            canUpdateIssues: true,
          },
          role: "owner",
          slug: "organization",
        },
        thread: { id: "thread_1", title: "Thread" },
        user: { name: "User", profileImage: null },
      },
    ],
    [
      "chat run",
      (gateway: AgentInternalGateway) =>
        gateway.startChatRun({
          clientMessageId: "message_1",
          ticket: CONNECTION_TICKET,
          threadId: "thread_1",
        }),
      {
        memoryResourceId: "resource_1",
        organization: {
          name: "Organization",
          permissions: {
            canCreateIssues: true,
            canDeleteAnyIssue: true,
            canDeleteOwnIssues: true,
            canReadIssues: true,
            canUpdateIssues: true,
          },
          role: "owner",
          slug: "organization",
        },
        run: {
          attempt: 1,
          expiresAt: "2999-07-22T00:00:00.000Z",
          grant: RUN_GRANT,
          rootRunId: "root_1",
          runId: "run_1",
          shouldGenerateTitle: false,
        },
        thread: { id: "thread_1", title: "Thread" },
        user: { name: "User", profileImage: null },
      },
    ],
    [
      "run liveness",
      (gateway: AgentInternalGateway) =>
        gateway.assertRunLive({ grant: RUN_GRANT }),
      { live: true },
    ],
    [
      "Web search authorization",
      (gateway: AgentInternalGateway) =>
        gateway.authorizeWebSearch({
          grant: RUN_GRANT,
          operationId: "operation_1",
          query: "query",
        }),
      { query: "query", reserved: true, reused: false },
    ],
    [
      "finalized run result",
      (gateway: AgentInternalGateway) =>
        gateway.finalizeRun({ grant: RUN_GRANT, outcome: "completed" }),
      { runId: "run_1", status: "completed" },
    ],
    [
      "Issue labels",
      (gateway: AgentInternalGateway) =>
        gateway.searchIssueLabels({ grant: RUN_GRANT, limit: 20 }),
      [{ label: "bug", usageCount: 1 }],
    ],
    [
      "Issue list",
      (gateway: AgentInternalGateway) =>
        gateway.searchIssues({ grant: RUN_GRANT, limit: 20 }),
      [
        {
          assigneeId: null,
          createdAt: "2026-07-28T00:00:00.000Z",
          description: "Description",
          dueDate: null,
          id: "issue_1",
          labels: ["bug"],
          number: 1,
          priority: "medium",
          revision: 1,
          status: "open",
          title: "Issue",
          updatedAt: "2026-07-28T00:00:00.000Z",
        },
      ],
    ],
    [
      "Issue detail",
      (gateway: AgentInternalGateway) =>
        gateway.getIssue({
          grant: RUN_GRANT,
          lookup: "id",
          id: "issue_1",
        }),
      {
        assigneeId: null,
        attachments: { items: [], nextCursor: null },
        createdAt: "2026-07-28T00:00:00.000Z",
        description: "Description",
        dueDate: null,
        id: "issue_1",
        labels: ["bug"],
        number: 1,
        priority: "medium",
        revision: 1,
        status: "open",
        title: "Issue",
        updatedAt: "2026-07-28T00:00:00.000Z",
      },
    ],
    [
      "action execution",
      (gateway: AgentInternalGateway) =>
        gateway.executeApprovedAction({
          actionId: "action_1",
          grant: RUN_GRANT,
        }),
      {
        actionId: "action_1",
        issue: { deleted: true, id: "issue_1", number: 1, revision: 2 },
        kind: "delete_issue",
        status: "succeeded",
      },
    ],
    [
      "finalized usage",
      (gateway: AgentInternalGateway) =>
        gateway.finalizeRun({
          grant: RUN_GRANT,
          outcome: "completed",
          usage: {
            provider: "openrouter",
            model: "model",
            inputTokenCount: 1,
            inputNoCacheTokenCount: 1,
            cacheReadTokenCount: 0,
            cacheWriteTokenCount: 0,
            outputTokenCount: 1,
            textOutputTokenCount: 1,
            reasoningTokenCount: 0,
            totalTokenCount: 2,
            imageInputCount: 0,
            durationMs: 1,
            runEventId: "event_1",
          },
        }),
      { runId: "run_1", status: "completed" },
    ],
  ])(
    "accepts the endpoint-specific %s response",
    async (_name, invoke, body) => {
      const binding: AgentInternalFetchBinding = {
        fetch: () => Promise.resolve(Response.json(body)),
      }
      await expect(
        invoke(createAgentInternalGateway(binding))
      ).resolves.toEqual(body)
    }
  )
})

describe("Agent internal response bounds and control errors", () => {
  it.each([
    ["malformed JSON", new Response("{")],
    [
      "invalid UTF-8",
      new Response(new Uint8Array([0xc3, 0x28]), {
        headers: { "content-type": "application/json" },
      }),
    ],
    [
      "oversized declared body",
      new Response("{}", {
        headers: { "content-length": String(16 * 1_024 * 1_024 + 1) },
      }),
    ],
    [
      "oversized streamed body",
      new Response(JSON.stringify({ name: "x".repeat(16 * 1_024 * 1_024) })),
    ],
  ])(
    "fails closed for %s without exposing body data",
    async (_name, response) => {
      const binding: AgentInternalFetchBinding = {
        fetch: () => Promise.resolve(response.clone()),
      }
      await expect(
        createAgentInternalGateway(binding).readAccountContext({
          grant: RUN_GRANT,
        })
      ).rejects.toThrow("Agent internal capability is unavailable")
    }
  )

  it("accepts the largest valid Issue search projection below the transport bound", async () => {
    const issues = Array.from({ length: 50 }, (_, index) => ({
      assigneeId: null,
      createdAt: "2026-07-28T00:00:00.000Z",
      description: "\0".repeat(50_000),
      dueDate: "2026-07-30T00:00:00.000Z",
      id: `issue_${index}`,
      labels: Array.from({ length: 20 }, (_value, label) => `label_${label}`),
      number: index + 1,
      priority: "medium",
      revision: 1,
      status: "open",
      title: "Issue",
      updatedAt: "2026-07-28T00:00:00.000Z",
    }))
    const binding: AgentInternalFetchBinding = {
      fetch: () => Promise.resolve(Response.json(issues)),
    }

    await expect(
      createAgentInternalGateway(binding).searchIssues({
        grant: RUN_GRANT,
        limit: 50,
      })
    ).resolves.toHaveLength(50)
  })

  it("accepts the exact declared transport maximum", async () => {
    const binding: AgentInternalFetchBinding = {
      fetch: () =>
        Promise.resolve(
          Response.json(
            { name: "User", profileImage: null },
            { headers: { "content-length": String(16 * 1_024 * 1_024) } }
          )
        ),
    }

    await expect(
      createAgentInternalGateway(binding).readAccountContext({
        grant: RUN_GRANT,
      })
    ).resolves.toEqual({ name: "User", profileImage: null })
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
        await gateway.startChatRun({
          clientMessageId: "message_control_error",
          ticket: CONNECTION_TICKET,
          threadId: "thread_1",
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
