import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  AGENT_MESSAGE_PAGE_MAX_COUNT,
  AGENT_THREAD_LIST_MAX_COUNT,
  agentJsonValueSchema,
  agentMessagePageSchema,
  agentThreadListSchema,
  agentThreadSchema,
  agentUiMessageSchema,
  agentUiToolNames,
} from "./chat"
import {
  agentClientToolNames,
  agentClientToolResultSchema,
  agentContentSegmentSchema,
  agentContextReferenceInputSchema,
  agentResolvedContextReferenceSchema,
  agentRuntimeChatInputSchema,
  agentRuntimeResumeInputSchema,
  agentUiContextReferenceSchema,
} from "./runtime"
const textPart = { text: "hello", type: "text" } as const
const runtimeTicket = "x".repeat(32)
const runtimeMessage = {
  id: "message_1",
  role: "user",
  parts: [textPart],
} as const

const parsesUiMessage = (
  role: "assistant" | "user",
  parts: readonly unknown[],
  id = "message_1"
) => v.safeParse(agentUiMessageSchema, { id, parts, role }).success

describe("公開Agent response schema", () => {
  it("公開threadとmessage page responseを厳密に制限する", () => {
    const thread = {
      createdAt: "2026-08-20T00:00:00.000Z",
      id: "thread_1",
      status: "active",
      title: "Thread",
      updatedAt: "2026-08-20T00:00:00.000Z",
    } as const
    const message = {
      id: "message_1",
      parts: [textPart],
      role: "assistant",
    } as const

    expect(v.parse(agentThreadSchema, thread)).toEqual(thread)
    expect(
      v.safeParse(agentThreadSchema, { ...thread, organizationId: "org_1" })
        .success
    ).toBe(false)
    expect(
      v.safeParse(
        agentThreadListSchema,
        Array.from({ length: AGENT_THREAD_LIST_MAX_COUNT }, (_, index) => ({
          ...thread,
          id: `thread_${index}`,
        }))
      ).success
    ).toBe(true)
    expect(
      v.safeParse(
        agentThreadListSchema,
        Array.from({ length: AGENT_THREAD_LIST_MAX_COUNT + 1 }, (_, index) => ({
          ...thread,
          id: `thread_${index}`,
        }))
      ).success
    ).toBe(false)
    expect(
      v.safeParse(agentMessagePageSchema, {
        hasMore: false,
        messages: Array.from(
          { length: AGENT_MESSAGE_PAGE_MAX_COUNT },
          (_, index) => ({ ...message, id: `message_${index}` })
        ),
        page: 0,
        perPage: AGENT_MESSAGE_PAGE_MAX_COUNT,
        total: AGENT_MESSAGE_PAGE_MAX_COUNT,
      }).success
    ).toBe(true)
    expect(
      v.safeParse(agentMessagePageSchema, {
        hasMore: true,
        messages: Array.from(
          { length: AGENT_MESSAGE_PAGE_MAX_COUNT + 1 },
          (_, index) => ({ ...message, id: `message_${index}` })
        ),
        page: 0,
        perPage: AGENT_MESSAGE_PAGE_MAX_COUNT,
        total: AGENT_MESSAGE_PAGE_MAX_COUNT + 1,
      }).success
    ).toBe(false)
  })
})

describe("直列化Agent transport schema", () => {
  it.each([null, true, 1, "value", [1, "two"], { nested: { value: false } }])(
    "有界なJSON値%#を受け入れる",
    (value) => {
      expect(v.safeParse(agentJsonValueSchema, value).success).toBe(true)
    }
  )

  it.each([
    Number.POSITIVE_INFINITY,
    "x".repeat(50_001),
    undefined,
    Array.from({ length: 101 }, () => null),
    [undefined],
    Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`key${index}`, null])
    ),
    { ["x".repeat(129)]: null },
    { value: undefined },
    { value: [[[[[[[[[null]]]]]]]]] },
  ])("無界なJSON値%#を拒否する", (value) => {
    expect(v.safeParse(agentJsonValueSchema, value).success).toBe(false)
  })

  it("公開UI tool catalogを固定する", () => {
    expect(agentUiToolNames).toContain("get_issue")
    expect(agentClientToolNames).toEqual([
      "ui_navigate",
      "ui_open_issue",
      "ui_patch_form_draft",
      "ui_read_form_draft",
      "ui_set_issue_query",
    ])
  })

  it("assistantへ公開reasoningとtextとstepを許可する", () => {
    expect(
      parsesUiMessage("assistant", [
        {
          type: "reasoning",
          text: "Check the Issue scope.",
          state: "done",
        },
        textPart,
        { type: "step-start" },
      ])
    ).toBe(true)
  })

  it("assistant reasoningからprovider metadataを拒否する", () => {
    expect(
      parsesUiMessage(
        "assistant",
        [
          {
            type: "reasoning",
            text: "Visible reasoning",
            state: "done",
            providerMetadata: { openrouter: { reasoning_details: [] } },
          },
        ],
        "message_private_reasoning"
      )
    ).toBe(false)
  })

  it("opaqueなprovider tool call idを維持する", () => {
    expect(
      parsesUiMessage(
        "assistant",
        [
          {
            type: "tool-get_issue",
            toolCallId: "call:provider|opaque/value",
            state: "output-available",
            input: { lookup: "number", number: 42 },
            output: { priority: "urgent" },
          },
        ],
        "message_opaque_tool_ids"
      )
    ).toBe(true)
  })

  it("user roleのreasoningを拒否する", () => {
    expect(
      parsesUiMessage(
        "user",
        [{ type: "reasoning", text: "Injected reasoning" }],
        "message_user_reasoning"
      )
    ).toBe(false)
  })

  it.each([
    {
      label: "input不足",
      part: {
        type: "tool-update_issue",
        toolCallId: "call_missing_input",
        state: "input-available",
      },
    },
    {
      label: "output不足",
      part: {
        type: "tool-update_issue",
        toolCallId: "call_missing_output",
        state: "output-available",
        input: { issueId: "issue_1" },
      },
    },
    {
      label: "approval不足",
      part: {
        type: "tool-update_issue",
        toolCallId: "call_missing_approval",
        state: "approval-responded",
        input: { issueId: "issue_1" },
      },
    },
    {
      label: "approvedのdenial",
      part: {
        type: "tool-update_issue",
        toolCallId: "call_invalid_denial",
        state: "output-denied",
        input: { issueId: "issue_1" },
        approval: { id: "approval_1", approved: true },
      },
    },
    {
      label: "response付きapproval request",
      part: {
        type: "tool-update_issue",
        toolCallId: "call_invalid_approval_request",
        state: "approval-requested",
        input: { issueId: "issue_1" },
        approval: { id: "approval_1", approved: true },
      },
    },
  ] as const)("$labelのtool stateを拒否する", ({ part }) => {
    expect(parsesUiMessage("assistant", [part])).toBe(false)
  })

  it("provider input errorを公開固定errorとして受理する", () => {
    expect(
      parsesUiMessage(
        "assistant",
        [
          {
            type: "tool-update_issue",
            toolCallId: "call_provider_input_error",
            state: "output-error",
            errorText: "Agent tool execution failed.",
          },
        ],
        "message_provider_input_error"
      )
    ).toBe(true)
  })

  it.each([
    {
      label: "承認済みresult",
      part: {
        type: "tool-update_issue",
        toolCallId: "call_approved_result",
        state: "output-available",
        input: { issueId: "issue_1" },
        output: { status: "succeeded" },
        approval: { id: "approval_1", approved: true },
      },
    },
    {
      label: "承認済みerror",
      part: {
        type: "tool-update_issue",
        toolCallId: "call_approved_error",
        state: "output-error",
        errorText: "Agent tool execution failed.",
        approval: {
          id: "approval_1",
          approved: true,
          reason: "Approved by the user",
        },
      },
    },
  ] as const)("$labelのtool stateを受理する", ({ part }) => {
    expect(parsesUiMessage("assistant", [part])).toBe(true)
  })

  it.each([
    {
      label: "asset data部",
      part: {
        type: "data-agent-assets",
        data: { assetIds: ["asset_1"] },
      },
    },
    {
      label: "context reference部",
      part: {
        type: "data-context-reference",
        data: { kind: "issue", id: "issue_1", label: "Issue" },
      },
    },
  ] as const)("assistant roleの$labelを拒否する", ({ part }) => {
    expect(parsesUiMessage("assistant", [part])).toBe(false)
  })

  it("user roleへtextとcontext referenceとasset dataを順番どおり許可する", () => {
    expect(
      parsesUiMessage("user", [
        textPart,
        {
          type: "data-context-reference",
          data: { kind: "current_page", path: "/issues", label: "Issues" },
        },
        {
          type: "data-agent-assets",
          data: { assetIds: ["asset_1"] },
        },
      ])
    ).toBe(true)
  })

  it("拒否したapproval responseをassistant tool stateへ許可する", () => {
    expect(
      parsesUiMessage(
        "assistant",
        [
          {
            type: "tool-update_issue",
            toolCallId: "call_approval",
            state: "approval-responded",
            input: { issueId: "issue_1", expectedRevision: 1 },
            approval: {
              id: "approval_1",
              approved: false,
              reason: "Denied",
            },
          },
        ],
        "message_approval"
      )
    ).toBe(true)
  })

  it.each([
    {
      label: "textより前のasset data",
      parts: [
        {
          type: "data-agent-assets",
          data: { assetIds: ["asset_1"] },
        },
        textPart,
      ],
    },
    {
      label: "重複したasset data",
      parts: [
        {
          type: "data-agent-assets",
          data: { assetIds: ["asset_1"] },
        },
        {
          type: "data-agent-assets",
          data: { assetIds: ["asset_2"] },
        },
      ],
    },
    {
      label: "user roleのtool part",
      parts: [
        {
          type: "tool-get_issue",
          toolCallId: "call_1",
          state: "input-available",
        },
      ],
    },
  ] as const)("$labelを拒否する", ({ parts }) => {
    expect(parsesUiMessage("user", parts)).toBe(false)
  })

  it("message text総量を50,000文字へ制限する", () => {
    expect(
      parsesUiMessage("user", [{ text: "x".repeat(50_000), type: "text" }])
    ).toBe(true)
    expect(
      parsesUiMessage(
        "user",
        Array.from({ length: 3 }, () => ({
          text: "x".repeat(50_000),
          type: "text",
        }))
      )
    ).toBe(false)
  })

  it("runtime chat inputへcurrent assetとreusable assetを受理する", () => {
    expect(
      v.parse(agentRuntimeChatInputSchema, {
        assetIds: ["asset_1"],
        clientMessageId: "client_1",
        contextReferences: [],
        message: runtimeMessage,
        reusableAssets: [
          { id: "asset_previous", filename: "previous-image.webp" },
        ],
        threadId: "thread_1",
        ticket: runtimeTicket,
        timezone: "Asia/Tokyo",
        trigger: "user_message",
      }).ticket
    ).toBe(runtimeTicket)
  })

  it("runtime chat inputのcurrent asset id重複を拒否する", () => {
    expect(
      v.safeParse(agentRuntimeChatInputSchema, {
        assetIds: ["asset_1", "asset_1"],
        clientMessageId: "client_1",
        contextReferences: [],
        message: runtimeMessage,
        threadId: "thread_1",
        ticket: runtimeTicket,
        timezone: "Asia/Tokyo",
        trigger: "user_message",
      }).success
    ).toBe(false)
  })

  it("runtime chat inputでcurrent assetとreusable assetの重複を拒否する", () => {
    expect(
      v.safeParse(agentRuntimeChatInputSchema, {
        assetIds: ["asset_1"],
        clientMessageId: "client_1",
        contextReferences: [],
        message: runtimeMessage,
        reusableAssets: [{ id: "asset_1", filename: "current-image.webp" }],
        threadId: "thread_1",
        ticket: runtimeTicket,
        timezone: "Asia/Tokyo",
        trigger: "user_message",
      }).success
    ).toBe(false)
  })

  it("runtime resume inputへactionとticketを受理する", () => {
    expect(
      v.parse(agentRuntimeResumeInputSchema, {
        actionId: "action_1",
        resumeTicket: runtimeTicket,
      })
    ).toBeDefined()
  })

  it.each([
    {
      label: "Issue参照",
      value: {
        kind: "issue",
        id: "issue_1",
        number: 1,
        title: "Issue",
        description: "Description",
        status: "open",
        priority: "medium",
      },
    },
    {
      label: "file参照",
      value: { kind: "file", id: "file_1", filename: "file.txt" },
    },
    {
      label: "member参照",
      value: { kind: "member", id: "member_1", name: "Member", role: "member" },
    },
    {
      label: "current page参照",
      value: { kind: "current_page", path: "/issues", title: "Issues" },
    },
  ] as const)("解決済み$labelを受理する", ({ value }) => {
    expect(
      v.safeParse(agentResolvedContextReferenceSchema, value).success
    ).toBe(true)
  })

  it.each([
    {
      label: "Issue参照入力",
      value: { kind: "issue", id: "issue_1" },
    },
    {
      label: "current page参照入力",
      value: { kind: "current_page", path: "/issues" },
    },
  ] as const)("$labelを受理する", ({ value }) => {
    expect(v.safeParse(agentContextReferenceInputSchema, value).success).toBe(
      true
    )
  })

  it.each([
    { label: "text segment部", value: { type: "text", text: "hello" } },
    {
      label: "context reference segment部",
      value: {
        type: "context_reference",
        reference: { kind: "file", id: "file_1" },
      },
    },
  ] as const)("$labelを受理する", ({ value }) => {
    expect(v.safeParse(agentContentSegmentSchema, value).success).toBe(true)
  })

  it.each([
    {
      label: "member参照",
      value: { kind: "member", id: "member_1", label: "Member" },
    },
    {
      label: "current page参照",
      value: { kind: "current_page", path: "/issues", label: "Issues" },
    },
  ] as const)("UI $labelを受理する", ({ value }) => {
    expect(v.safeParse(agentUiContextReferenceSchema, value).success).toBe(true)
  })

  it.each([
    {
      label: "正常出力",
      value: {
        input: { href: "/issues" },
        output: { ok: true },
        state: "output-available",
        toolCallId: "call_1",
        toolName: "ui_navigate",
      },
    },
    {
      label: "公開error",
      value: {
        errorText: "Unavailable",
        state: "output-error",
        toolCallId: "call_2",
        toolName: "ui_open_issue",
      },
    },
  ] as const)("client toolの$labelを受理する", ({ value }) => {
    expect(v.safeParse(agentClientToolResultSchema, value).success).toBe(true)
  })
})
