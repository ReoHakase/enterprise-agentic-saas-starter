import type { AgentRuntimeChatInput } from "@enterprise-agentic-saas/agent-contracts"
import { describe, expect, it } from "vitest"

import {
  parseAgentRuntimeChatInput,
  parseAgentRuntimeResumeInput,
  readBoundedPrivateJson,
} from "./request"

const TICKET = "ticket_0123456789abcdefghijklmnopqrstuvwxyz"
const validInput = (): AgentRuntimeChatInput => ({
  assetIds: ["asset_1"],
  contextReferences: [],
  clientMessageId: "message_1",
  message: {
    id: "message_1",
    role: "user",
    parts: [
      { type: "text", text: "Create an issue from this image" },
      { type: "data-agent-assets", data: { assetIds: ["asset_1"] } },
    ],
  },
  reusableAssets: [],
  threadId: "thread_1",
  ticket: TICKET,
  timezone: "Asia/Tokyo",
  trigger: "user_message",
})
const clientToolContinuation = (): AgentRuntimeChatInput => ({
  ...validInput(),
  assetIds: [],
  clientMessageId: "continuation_0123456789abcdefghijklmnopqrstuvwxyz",
  message: {
    id: "assistant_1",
    role: "assistant",
    parts: [],
  },
  trigger: "client_tool_result",
})

describe("private Agent runtime requestの契約", () => {
  it("正確な正規chat envelopeを受け入れる", () => {
    expect(parseAgentRuntimeChatInput(validInput())).toMatchObject({
      assetIds: ["asset_1"],
      clientMessageId: "message_1",
      threadId: "thread_1",
      timezone: "Asia/Tokyo",
      trigger: "user_message",
    })
  })

  it("有界かつ互いに素なserver選択済み再利用assetだけを受け入れる", () => {
    const reusable = validInput()
    reusable.reusableAssets = [
      { id: "asset_previous", filename: "previous-image.webp" },
    ]
    expect(parseAgentRuntimeChatInput(reusable)).toMatchObject({
      reusableAssets: [
        { id: "asset_previous", filename: "previous-image.webp" },
      ],
    })

    reusable.reusableAssets = [
      { id: "asset_1", filename: "current-image.webp" },
    ]
    expect(parseAgentRuntimeChatInput(reusable)).toBeUndefined()

    const continuation = clientToolContinuation()
    continuation.reusableAssets = [
      { id: "asset_previous", filename: "previous-image.webp" },
    ]
    expect(parseAgentRuntimeChatInput(continuation)).toBeUndefined()
  })

  it("正規mention順をAPI解決済みcontextへ束縛する", () => {
    const input = validInput()
    input.assetIds = []
    input.message = {
      id: "message_1",
      role: "user",
      parts: [
        { type: "text", text: "Compare " },
        {
          type: "data-context-reference",
          data: { kind: "issue", id: "issue_1", label: "Issue #1" },
        },
        { type: "text", text: " with " },
        {
          type: "data-context-reference",
          data: {
            kind: "current_page",
            path: "/acme/issues/1",
            label: "Current Issue",
          },
        },
      ],
    }
    input.contextReferences = [
      {
        kind: "issue",
        id: "issue_1",
        number: 1,
        title: "First issue",
        description: "Resolved by the API",
        status: "open",
        priority: "medium",
      },
      {
        kind: "current_page",
        path: "/acme/issues/1",
        title: "First issue",
      },
    ]
    expect(parseAgentRuntimeChatInput(input)).toBeDefined()

    input.contextReferences.reverse()
    expect(parseAgentRuntimeChatInput(input)).toBeUndefined()
  })

  it("browser制御history fieldと不一致な現在stateを拒否する", () => {
    expect(
      parseAgentRuntimeChatInput({ ...validInput(), organizationId: "org_1" })
    ).toBeUndefined()
    expect(
      parseAgentRuntimeChatInput({
        ...validInput(),
        clientMessageId: "message_2",
      })
    ).toBeUndefined()
    expect(
      parseAgentRuntimeChatInput({ ...validInput(), assetIds: ["asset_2"] })
    ).toBeUndefined()
    expect(
      parseAgentRuntimeChatInput({ ...validInput(), timezone: "Not/AZone" })
    ).toBeUndefined()
  })

  it("重複したcurrent asset idを拒否する", () => {
    const duplicateAssets = validInput()
    duplicateAssets.assetIds = ["asset_1", "asset_1"]
    expect(parseAgentRuntimeChatInput(duplicateAssets)).toBeUndefined()
  })

  it("browser制御history fieldを拒否する", () => {
    const assistantHistory = {
      ...validInput(),
      messages: [{ id: "assistant_1", role: "assistant", parts: [] }],
    }
    expect(parseAgentRuntimeChatInput(assistantHistory)).toBeUndefined()
  })

  it("client tool JSONを有界な値へ制限する", () => {
    const hugeToolInput = clientToolContinuation()
    hugeToolInput.message = {
      id: "assistant_1",
      role: "assistant",
      parts: [
        {
          type: "tool-ui_read_form_draft",
          toolCallId: "call_1",
          state: "input-available",
          input: { query: "x".repeat(10_001) },
        },
      ],
    }
    expect(parseAgentRuntimeChatInput(hugeToolInput)).toBeUndefined()

    const boundedArrayInput = clientToolContinuation()
    boundedArrayInput.message = {
      id: "assistant_1",
      role: "assistant",
      parts: [
        {
          type: "tool-ui_read_form_draft",
          toolCallId: "call_2",
          state: "output-available",
          input: [null, true, 1, "query", { nested: false }],
          output: [],
        },
      ],
    }
    expect(parseAgentRuntimeChatInput(boundedArrayInput)).toBeDefined()

    const tooManyItems = clientToolContinuation()
    tooManyItems.message = {
      id: "assistant_1",
      role: "assistant",
      parts: [
        {
          type: "tool-ui_read_form_draft",
          toolCallId: "call_3",
          state: "output-available",
          input: Array.from({ length: 101 }, () => true),
          output: [],
        },
      ],
    }
    expect(parseAgentRuntimeChatInput(tooManyItems)).toBeUndefined()
  })

  it("閉じたresume envelopeだけを受け入れる", () => {
    expect(
      parseAgentRuntimeResumeInput({
        actionId: "action_1",
        resumeTicket: TICKET,
      })
    ).toEqual({ actionId: "action_1", resumeTicket: TICKET })
    expect(
      parseAgentRuntimeResumeInput({
        actionId: "action_1",
        extra: true,
        resumeTicket: TICKET,
      })
    ).toBeUndefined()
  })

  it("有界なserver作成client tool継続を受け入れる", () => {
    const continuation = validInput()
    continuation.assetIds = []
    continuation.clientMessageId =
      "continuation_0123456789abcdefghijklmnopqrstuvwxyz"
    continuation.trigger = "client_tool_result"
    continuation.message = {
      id: "assistant_1",
      role: "assistant",
      parts: [
        {
          type: "tool-ui_read_form_draft",
          toolCallId: "call_1",
          state: "output-available",
          input: {},
          output: { formId: "form_1" },
        },
      ],
    }
    expect(parseAgentRuntimeChatInput(continuation)).toMatchObject({
      clientMessageId: continuation.clientMessageId,
      trigger: "client_tool_result",
    })
  })

  it("正確なcontent typeの場合だけ有界JSONを読む", async () => {
    await expect(
      readBoundedPrivateJson(
        new Request("https://agent.internal/chat", {
          body: JSON.stringify({ ok: true }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      )
    ).resolves.toEqual({ ok: true })
    await expect(
      readBoundedPrivateJson(
        new Request("https://agent.internal/chat", {
          body: "{}",
          headers: { "content-type": "text/plain" },
          method: "POST",
        })
      )
    ).rejects.toThrow("Invalid private Agent request")
    const malformedFailure = await readBoundedPrivateJson(
      new Request("https://agent.internal/chat", {
        body: "not-json",
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    ).then(
      () => undefined,
      (error: unknown) => error
    )
    expect(malformedFailure).toBeInstanceOf(Error)
    if (!(malformedFailure instanceof Error)) {
      throw new Error("Expected private request error")
    }
    expect(malformedFailure.message).toBe("Invalid private Agent request")
    expect(malformedFailure.cause).toBeInstanceOf(SyntaxError)
    await expect(
      readBoundedPrivateJson(
        new Request("https://agent.internal/chat", {
          body: "{}",
          headers: {
            "content-length": String(5 * 1024 * 1024 + 1),
            "content-type": "application/json",
          },
          method: "POST",
        })
      )
    ).rejects.toThrow("Invalid private Agent request")
  })
})
