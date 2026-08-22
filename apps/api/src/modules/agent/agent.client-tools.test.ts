import { describe, expect, it } from "vitest"

import {
  configureAgentStreamCapture,
  createFixture,
  request,
} from "./agent.test-support"
import { createAgentInternalApi } from "./internal-api"
import { configureAgentRuntime } from "./runtime"
import { createAgentThreadForSession } from "./threads/repository"

describe("Agent client tool continuation", () => {
  it("rejects a malformed native tool state from private Memory history", async () => {
    const { app, db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Malformed approval history",
    })
    configureAgentRuntime({
      fetch: () =>
        Promise.resolve(
          Response.json({
            hasMore: false,
            messages: [
              {
                id: "message_malformed_approval",
                role: "assistant",
                parts: [
                  {
                    type: "tool-delete_issue",
                    toolCallId: "call_malformed_approval",
                    state: "approval-requested",
                    input: { expectedRevision: 1, issueId: "issue_1" },
                    approval: { id: "approval_1", approved: true },
                  },
                ],
              },
            ],
            page: 0,
            perPage: 40,
            total: 1,
          })
        ),
    })

    expect(
      (await app.handle(request(`/agent/threads/${thread.id}/messages`))).status
    ).toBe(503)
  })

  it("accepts bounded native approval states from the private Memory history boundary", async () => {
    const { app, db } = await createFixture()
    const thread = await createAgentThreadForSession(db, {
      sessionId: "agent-session-a",
      userId: "agent-user-a",
      title: "Approval history",
    })
    configureAgentRuntime({
      fetch: () =>
        Promise.resolve(
          Response.json({
            hasMore: false,
            messages: [
              {
                id: "message_approval",
                role: "assistant",
                parts: [
                  {
                    type: "tool-update_issue",
                    toolCallId: "call_approval",
                    state: "approval-responded",
                    input: {
                      expectedRevision: 1,
                      issueId: "issue_1",
                      title: "Declined title",
                    },
                    approval: {
                      id: "approval_1",
                      approved: false,
                      reason: "Denied",
                    },
                  },
                  {
                    type: "tool-update_issue",
                    toolCallId: "call_approved_result",
                    state: "output-available",
                    input: { issueId: "issue_1" },
                    output: { status: "succeeded" },
                    approval: { id: "approval_2", approved: true },
                  },
                  {
                    type: "tool-update_issue",
                    toolCallId: "call_approved_error",
                    state: "output-error",
                    errorText: "Agent tool execution failed.",
                    approval: {
                      id: "approval_3",
                      approved: true,
                      reason: "Approved by the user",
                    },
                  },
                ],
              },
            ],
            page: 0,
            perPage: 40,
            total: 1,
          })
        ),
    })

    const response = await app.handle(
      request(`/agent/threads/${thread.id}/messages`)
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      messages: [
        {
          parts: [
            expect.objectContaining({
              state: "approval-responded",
              approval: {
                id: "approval_1",
                approved: false,
                reason: "Denied",
              },
            }),
            expect.objectContaining({
              state: "output-available",
              approval: { id: "approval_2", approved: true },
            }),
            expect.objectContaining({
              state: "output-error",
              approval: {
                id: "approval_3",
                approved: true,
                reason: "Approved by the user",
              },
            }),
          ],
        },
      ],
    })
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
    const continuationBody = {
      threadId: thread.id,
      assistantMessageId: "assistant_client_tool_1",
      clientToolResults: [
        {
          toolCallId: "call_client_1",
          toolName: "ui_read_form_draft",
          state: "output-available",
          input: { formId: "form_1" },
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
    expect(inputs[0]?.message).toEqual({
      id: "assistant_client_tool_1",
      role: "assistant",
      parts: [
        {
          type: "tool-ui_read_form_draft",
          toolCallId: "call_client_1",
          state: "output-available",
          input: continuationBody.clientToolResults[0]?.input,
          output: continuationBody.clientToolResults[0]?.output,
        },
      ],
    })

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
    await internal.startChatRun({
      clientMessageId: syntheticMessageId,
      ticket: privateTicket,
      threadId: thread.id,
      trigger: "client_tool_result",
    })
    await expect(
      internal.startChatRun({
        clientMessageId: syntheticMessageId,
        ticket: privateTicket,
        threadId: thread.id,
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
    expect(conflict.status).toBe(200)
    await conflict.body?.cancel()
    expect(inputs).toHaveLength(3)
    expect(inputs[2]?.clientMessageId).toBe(syntheticMessageId)
    const changedTicket = inputs[2]?.ticket
    if (typeof changedTicket !== "string") {
      throw new Error("Missing changed continuation capability")
    }
    await expect(
      internal.startChatRun({
        clientMessageId: syntheticMessageId,
        ticket: changedTicket,
        threadId: thread.id,
        trigger: "client_tool_result",
      })
    ).rejects.toMatchObject({ code: "conflict" })
  })
})
