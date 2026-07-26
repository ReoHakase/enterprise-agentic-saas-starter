import { describe, expect, it } from "vitest"

import {
  configureAgentStreamCapture,
  createFixture,
  request,
} from "./agent.test-support"
import { createAgentInternalApi } from "./internal-api"
import {
  createAgentThreadForSession,
  issueAgentConnectionTicket,
} from "./threads/repository"

describe("Agent client tool continuation", () => {
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
