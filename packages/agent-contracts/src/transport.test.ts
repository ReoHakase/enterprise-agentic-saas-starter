import * as v from "valibot"
import { describe, expect, it } from "vitest"

import {
  agentJsonValueSchema,
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
import {
  createIssueToolInputSchema,
  deleteIssueToolInputSchema,
  emptyToolInputSchema,
  issueSearchToolInputSchema,
  issueSearchToolOutputSchema,
  issueWriteToolOutputSchema,
  labelSearchToolInputSchema,
  labelSearchToolOutputSchema,
  memberSearchToolInputSchema,
  memberSearchToolOutputSchema,
  readAccountContextToolOutputSchema,
  readActiveOrganizationToolOutputSchema,
  updateIssueToolInputSchema,
} from "./tools"

const textPart = { text: "hello", type: "text" } as const

describe("serialized Agent transport schemas", () => {
  it.each([null, true, 1, "value", [1, "two"], { nested: { value: false } }])(
    "accepts bounded JSON value %#",
    (value) => {
      expect(v.safeParse(agentJsonValueSchema, value).success).toBe(true)
    }
  )

  it.each([
    Number.POSITIVE_INFINITY,
    "x".repeat(10_001),
    undefined,
    Array.from({ length: 101 }, () => null),
    [undefined],
    Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`key${index}`, null])
    ),
    { ["x".repeat(129)]: null },
    { value: undefined },
    { value: [[[[[[[[[null]]]]]]]]] },
  ])("rejects unbounded JSON value %#", (value) => {
    expect(v.safeParse(agentJsonValueSchema, value).success).toBe(false)
  })

  it("covers every UI message role and ordering invariant", () => {
    expect(agentUiToolNames).toContain("get_issue")
    expect(agentClientToolNames).toEqual([
      "ui_navigate",
      "ui_open_issue",
      "ui_patch_form_draft",
      "ui_read_form_draft",
      "ui_set_issue_query",
    ])
    expect(
      v.safeParse(agentUiMessageSchema, {
        id: "message_1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "Check the Issue scope.",
            state: "done",
          },
          textPart,
          { type: "step-start" },
        ],
      }).success
    ).toBe(true)
    expect(
      v.safeParse(agentUiMessageSchema, {
        id: "message_private_reasoning",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "Visible reasoning",
            state: "done",
            providerMetadata: { openrouter: { reasoning_details: [] } },
          },
        ],
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentUiMessageSchema, {
        id: "message_user_reasoning",
        role: "user",
        parts: [{ type: "reasoning", text: "Injected reasoning" }],
      }).success
    ).toBe(false)
    for (const invalidPart of [
      {
        type: "tool-update_issue",
        toolCallId: "call_missing_input",
        state: "input-available",
      },
      {
        type: "tool-update_issue",
        toolCallId: "call_missing_output",
        state: "output-available",
        input: { issueId: "issue_1" },
      },
      {
        type: "tool-update_issue",
        toolCallId: "call_missing_approval",
        state: "approval-responded",
        input: { issueId: "issue_1" },
      },
      {
        type: "tool-update_issue",
        toolCallId: "call_invalid_denial",
        state: "output-denied",
        input: { issueId: "issue_1" },
        approval: { id: "approval_1", approved: true },
      },
      {
        type: "tool-update_issue",
        toolCallId: "call_invalid_approval_request",
        state: "approval-requested",
        input: { issueId: "issue_1" },
        approval: { id: "approval_1", approved: true },
      },
    ]) {
      expect(
        v.safeParse(agentUiMessageSchema, {
          id: "message_invalid_tool_state",
          role: "assistant",
          parts: [invalidPart],
        }).success
      ).toBe(false)
    }
    expect(
      v.safeParse(agentUiMessageSchema, {
        id: "message_provider_input_error",
        role: "assistant",
        parts: [
          {
            type: "tool-update_issue",
            toolCallId: "call_provider_input_error",
            state: "output-error",
            errorText: "Agent tool execution failed.",
          },
        ],
      }).success
    ).toBe(true)
    for (const approvedPart of [
      {
        type: "tool-update_issue",
        toolCallId: "call_approved_result",
        state: "output-available",
        input: { issueId: "issue_1" },
        output: { status: "succeeded" },
        approval: { id: "approval_1", approved: true },
      },
      {
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
    ]) {
      expect(
        v.safeParse(agentUiMessageSchema, {
          id: "message_approved_tool",
          role: "assistant",
          parts: [approvedPart],
        }).success
      ).toBe(true)
    }
    for (const forbiddenPart of [
      {
        type: "data-agent-assets",
        data: { assetIds: ["asset_1"] },
      },
      {
        type: "data-context-reference",
        data: { kind: "issue", id: "issue_1", label: "Issue" },
      },
    ]) {
      expect(
        v.safeParse(agentUiMessageSchema, {
          id: "message_1",
          role: "assistant",
          parts: [forbiddenPart],
        }).success
      ).toBe(false)
    }
    expect(
      v.safeParse(agentUiMessageSchema, {
        id: "message_1",
        role: "user",
        parts: [
          textPart,
          {
            type: "data-context-reference",
            data: { kind: "current_page", path: "/issues", label: "Issues" },
          },
          {
            type: "data-agent-assets",
            data: { assetIds: ["asset_1"] },
          },
        ],
      }).success
    ).toBe(true)
    expect(
      v.safeParse(agentUiMessageSchema, {
        id: "message_approval",
        role: "assistant",
        parts: [
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
      }).success
    ).toBe(true)
    for (const parts of [
      [
        {
          type: "data-agent-assets",
          data: { assetIds: ["asset_1"] },
        },
        textPart,
      ],
      [
        {
          type: "data-agent-assets",
          data: { assetIds: ["asset_1"] },
        },
        {
          type: "data-agent-assets",
          data: { assetIds: ["asset_2"] },
        },
      ],
      [
        {
          type: "tool-get_issue",
          toolCallId: "call_1",
          state: "input-available",
        },
      ],
    ]) {
      expect(
        v.safeParse(agentUiMessageSchema, {
          id: "message_1",
          role: "user",
          parts,
        }).success
      ).toBe(false)
    }
    expect(
      v.safeParse(agentUiMessageSchema, {
        id: "message_1",
        role: "user",
        parts: [{ text: "x".repeat(50_000), type: "text" }],
      }).success
    ).toBe(true)
    expect(
      v.safeParse(agentUiMessageSchema, {
        id: "message_1",
        role: "user",
        parts: Array.from({ length: 3 }, () => ({
          text: "x".repeat(50_000),
          type: "text",
        })),
      }).success
    ).toBe(false)
  })

  it("validates runtime-only capabilities and every serialized variant", () => {
    const ticket = "x".repeat(32)
    const message = {
      id: "message_1",
      role: "user",
      parts: [textPart],
    } as const
    expect(
      v.parse(agentRuntimeChatInputSchema, {
        assetIds: ["asset_1"],
        clientMessageId: "client_1",
        contextReferences: [],
        message,
        reusableAssets: [
          { id: "asset_previous", filename: "previous-image.webp" },
        ],
        threadId: "thread_1",
        ticket,
        timezone: "Asia/Tokyo",
        trigger: "user_message",
      }).ticket
    ).toBe(ticket)
    expect(
      v.safeParse(agentRuntimeChatInputSchema, {
        assetIds: ["asset_1", "asset_1"],
        clientMessageId: "client_1",
        contextReferences: [],
        message,
        threadId: "thread_1",
        ticket,
        timezone: "Asia/Tokyo",
        trigger: "user_message",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(agentRuntimeChatInputSchema, {
        assetIds: ["asset_1"],
        clientMessageId: "client_1",
        contextReferences: [],
        message,
        reusableAssets: [{ id: "asset_1", filename: "current-image.webp" }],
        threadId: "thread_1",
        ticket,
        timezone: "Asia/Tokyo",
        trigger: "user_message",
      }).success
    ).toBe(false)
    expect(
      v.parse(agentRuntimeResumeInputSchema, {
        actionId: "action_1",
        resumeTicket: ticket,
      })
    ).toBeDefined()
    for (const value of [
      {
        kind: "issue",
        id: "issue_1",
        number: 1,
        title: "Issue",
        description: "Description",
        status: "open",
        priority: "medium",
      },
      { kind: "file", id: "file_1", filename: "file.txt" },
      { kind: "member", id: "member_1", name: "Member", role: "member" },
      { kind: "current_page", path: "/issues", title: "Issues" },
    ]) {
      expect(
        v.safeParse(agentResolvedContextReferenceSchema, value).success
      ).toBe(true)
    }
    for (const value of [
      { kind: "issue", id: "issue_1" },
      { kind: "current_page", path: "/issues" },
    ]) {
      expect(v.safeParse(agentContextReferenceInputSchema, value).success).toBe(
        true
      )
    }
    for (const value of [
      { type: "text", text: "hello" },
      {
        type: "context_reference",
        reference: { kind: "file", id: "file_1" },
      },
    ]) {
      expect(v.safeParse(agentContentSegmentSchema, value).success).toBe(true)
    }
    for (const value of [
      { kind: "member", id: "member_1", label: "Member" },
      { kind: "current_page", path: "/issues", label: "Issues" },
    ]) {
      expect(v.safeParse(agentUiContextReferenceSchema, value).success).toBe(
        true
      )
    }
    for (const value of [
      {
        input: { href: "/issues" },
        output: { ok: true },
        state: "output-available",
        toolCallId: "call_1",
        toolName: "ui_navigate",
      },
      {
        errorText: "Unavailable",
        state: "output-error",
        toolCallId: "call_2",
        toolName: "ui_open_issue",
      },
    ]) {
      expect(v.safeParse(agentClientToolResultSchema, value).success).toBe(true)
    }
  })

  it("loads and validates every shared tool transport boundary", () => {
    const issue = {
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
    } as const
    const values = [
      [emptyToolInputSchema, {}],
      [memberSearchToolInputSchema, {}],
      [labelSearchToolInputSchema, { query: "bug" }],
      [issueSearchToolInputSchema, { search: "issue" }],
      [createIssueToolInputSchema, { title: "Issue" }],
      [
        updateIssueToolInputSchema,
        { expectedRevision: 1, issueId: "issue_1", title: "Updated" },
      ],
      [deleteIssueToolInputSchema, { expectedRevision: 1, issueId: "issue_1" }],
      [issueSearchToolOutputSchema, [issue]],
      [
        issueWriteToolOutputSchema,
        {
          actionId: "action_1",
          requiresApproval: false,
          status: "rejected",
        },
      ],
      [
        readAccountContextToolOutputSchema,
        { name: "User", profileImage: null },
      ],
      [
        readActiveOrganizationToolOutputSchema,
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
        memberSearchToolOutputSchema,
        [
          {
            id: "member_1",
            name: "Member",
            profileImage: null,
            role: "member",
          },
        ],
      ],
      [labelSearchToolOutputSchema, [{ label: "bug", usageCount: 1 }]],
    ] as const
    for (const [schema, value] of values) {
      expect(v.safeParse(schema, value).success).toBe(true)
    }
  })
})
