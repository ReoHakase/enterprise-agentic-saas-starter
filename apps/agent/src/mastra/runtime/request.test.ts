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

describe("private Agent runtime request", () => {
  it("accepts the exact canonical chat envelope", () => {
    expect(parseAgentRuntimeChatInput(validInput())).toMatchObject({
      assetIds: ["asset_1"],
      clientMessageId: "message_1",
      threadId: "thread_1",
      timezone: "Asia/Tokyo",
      trigger: "user_message",
    })
  })

  it("accepts only bounded, disjoint server-selected reusable assets", () => {
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

  it("binds canonical mention order to the API-resolved context", () => {
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

  it("rejects browser-controlled history fields and mismatched current state", () => {
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

  it("rejects duplicate assets, unsafe URLs, and unbounded tool JSON", () => {
    const duplicateAssets = validInput()
    duplicateAssets.assetIds = ["asset_1", "asset_1"]
    expect(parseAgentRuntimeChatInput(duplicateAssets)).toBeUndefined()

    const assistantHistory = {
      ...validInput(),
      messages: [{ id: "assistant_1", role: "assistant", parts: [] }],
    }
    expect(parseAgentRuntimeChatInput(assistantHistory)).toBeUndefined()

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

  it("accepts only the closed resume envelope", () => {
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

  it("accepts a bounded server-authored client tool continuation", () => {
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

  it("reads bounded JSON only with the exact content type", async () => {
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
    await expect(
      readBoundedPrivateJson(
        new Request("https://agent.internal/chat", {
          body: "not-json",
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      )
    ).rejects.toThrow("Invalid private Agent request")
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
