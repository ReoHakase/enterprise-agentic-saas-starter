import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"

import { sanitizeAssistantMessage, toModelUiMessages } from "./canonical"

describe("canonical assistant message projection", () => {
  it("keeps only allowlisted UI fields and maps dynamic tools", () => {
    const message: UIMessage = {
      id: "assistant_1",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Issue prepared",
          providerMetadata: { private: { token: "secret" } },
        },
        {
          type: "dynamic-tool",
          toolName: "create_issue",
          toolCallId: "call_1",
          state: "output-available",
          input: { title: "Broken button" },
          output: { actionId: "action_1", status: "pending" },
          callProviderMetadata: { private: { token: "secret" } },
        },
        {
          type: "file",
          mediaType: "text/plain",
          url: "data:text/plain,secret",
        },
      ],
    }

    const projected = sanitizeAssistantMessage(message)
    expect(projected).toEqual({
      id: "assistant_1",
      role: "assistant",
      parts: [
        { type: "text", text: "Issue prepared" },
        {
          type: "tool-create_issue",
          toolCallId: "call_1",
          state: "output-available",
          input: { title: "Broken button" },
          output: { actionId: "action_1", status: "pending" },
        },
      ],
    })
    expect(JSON.stringify(projected)).not.toContain("secret")
  })

  it("drops disallowed tools and unsafe sources without leaking metadata", () => {
    const message: UIMessage = {
      id: "assistant_2",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "change_organization_settings",
          toolCallId: "private call id",
          state: "input-available",
          input: { role: "owner" },
        },
        {
          type: "source-url",
          sourceId: "private source id",
          url: "javascript:alert(1)",
        },
      ],
    }

    const projected = sanitizeAssistantMessage(message)
    expect(projected.parts).toEqual([
      { type: "text", text: "応答を完了できませんでした。" },
    ])
  })

  it("retains valid sources, error summaries, and bounded JSON values", () => {
    const message: UIMessage = {
      id: "assistant_3",
      role: "assistant",
      parts: [
        {
          type: "source-url",
          sourceId: "source_1",
          title: "Reference",
          url: "https://example.com/reference",
        },
        {
          type: "dynamic-tool",
          toolName: "search_issues",
          toolCallId: "call_2",
          state: "output-error",
          input: { q: Number.NaN, nested: { ok: true } },
          errorText: "Search failed",
        },
      ],
    }
    expect(sanitizeAssistantMessage(message).parts).toEqual([
      {
        type: "source-url",
        sourceId: "source_1",
        title: "Reference",
        url: "https://example.com/reference",
      },
      {
        type: "tool-search_issues",
        toolCallId: "call_2",
        state: "output-error",
        input: { nested: { ok: true } },
        errorText: "Search failed",
      },
    ])
  })

  it("persists only safe metadata for Issue image tool traces", () => {
    const projected = sanitizeAssistantMessage({
      id: "assistant_issue_image",
      role: "assistant",
      parts: [
        {
          type: "tool-read_issue_attachment_image",
          toolCallId: "call_issue_image",
          state: "output-available",
          input: { issueId: "issue_1", fileId: "file_1" },
          output: {
            issueId: "issue_1",
            fileId: "file_1",
            contentType: "image/webp",
            sizeBytes: 3,
          },
          callProviderMetadata: {
            mastra: {
              modelOutput: {
                type: "content",
                value: [
                  { type: "media", data: "AQID", mediaType: "image/webp" },
                ],
              },
            },
          },
        },
      ],
    })

    expect(projected.parts).toEqual([
      {
        type: "tool-read_issue_attachment_image",
        toolCallId: "call_issue_image",
        state: "output-available",
        input: { issueId: "issue_1", fileId: "file_1" },
        output: {
          issueId: "issue_1",
          fileId: "file_1",
          contentType: "image/webp",
          sizeBytes: 3,
        },
      },
    ])
    expect(JSON.stringify(projected)).not.toContain("AQID")
  })

  it("normalizes identifiers, static tool states, and oversized messages", () => {
    const message: UIMessage = {
      id: "invalid message id",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "Reason" },
        { type: "step-start" },
        {
          type: "source-url",
          sourceId: "invalid source id",
          url: "https://example.com/no-title",
        },
        {
          type: "tool-ui_navigate",
          toolCallId: "invalid call id",
          state: "output-denied",
          input: { nested: [null, true, 1, "x"] },
          approval: { id: "approval_1", approved: false },
        },
        { type: "text", text: "a".repeat(50_000) },
        { type: "text", text: "b".repeat(50_000) },
        { type: "text", text: "c".repeat(50_000) },
      ],
    }
    const projected = sanitizeAssistantMessage(message)
    expect(projected.id).toMatch(/^message_[0-9a-f-]{36}$/)
    expect(projected.parts).toHaveLength(6)
    expect(projected.parts[2]).toMatchObject({
      type: "source-url",
      sourceId: expect.stringMatching(/^source_[0-9a-f-]{36}$/),
    })
    expect(projected.parts[3]).toMatchObject({
      type: "tool-ui_navigate",
      toolCallId: expect.stringMatching(/^call_[0-9a-f-]{36}$/),
      state: "output-denied",
    })
  })

  it("drops transient activity and persists context, title, and reasoning", () => {
    const projected = sanitizeAssistantMessage({
      id: "assistant_trace",
      role: "assistant",
      parts: [
        {
          type: "data-activity",
          data: { kind: "tool", status: "running", label: "Searching Issues" },
        },
        {
          type: "data-context-budget",
          data: {
            contextWindowTokens: 1_000_000,
            reservedOutputTokens: 4_096,
            estimated: {
              system: 10,
              skills: 20,
              tools: 30,
              history: 40,
              pageContext: 50,
              attachments: 60,
              total: 210,
            },
            observedInputTokens: null,
            level: "normal",
          },
        },
        {
          type: "data-thread-title",
          data: {
            threadId: "thread_trace",
            title: "A useful thread title",
            renamed: true,
          },
        },
        { type: "reasoning", text: "A bounded provider reasoning summary" },
      ],
    })

    expect(projected.parts).toHaveLength(3)
    expect(projected.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "data-context-budget" }),
        expect.objectContaining({ type: "data-thread-title" }),
        expect.objectContaining({ type: "reasoning" }),
      ])
    )
    expect(projected.parts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "data-activity" }),
      ])
    )
  })

  it("drops malformed trace projections and deeply unsafe tool JSON", () => {
    const baseBudget = {
      contextWindowTokens: 1_000_000,
      reservedOutputTokens: 4_096,
      estimated: {
        system: 1,
        skills: 1,
        tools: 1,
        history: 1,
        pageContext: 1,
        attachments: 1,
        total: 6,
      },
      observedInputTokens: 6,
      level: "notice",
    }
    const invalidEstimatedBudgets: Array<{
      estimated: Record<string, number>
    }> = []
    for (const key of Object.keys(baseBudget.estimated)) {
      const estimated: Record<string, number> = { ...baseBudget.estimated }
      estimated[key] = -1
      invalidEstimatedBudgets.push({ ...baseBudget, estimated })
    }
    const invalidBudgets = [
      { ...baseBudget, contextWindowTokens: 0 },
      { ...baseBudget, reservedOutputTokens: 0 },
      { ...baseBudget, estimated: null },
      ...invalidEstimatedBudgets,
      { ...baseBudget, observedInputTokens: -1 },
      { ...baseBudget, level: "unknown" },
    ]
    const invalidParts = [
      ...invalidBudgets.map((data) => ({ type: "data-context-budget", data })),
      {
        type: "data-activity",
        data: { kind: "private", status: "running", label: "x" },
      },
      {
        type: "data-activity",
        data: { kind: "status", status: "unknown", label: "x" },
      },
      {
        type: "data-activity",
        data: { kind: "status", status: "failed", label: "" },
      },
      {
        type: "data-thread-title",
        data: { threadId: "bad id", title: "x", renamed: true },
      },
      {
        type: "data-thread-title",
        data: { threadId: "thread_1", title: "", renamed: true },
      },
      {
        type: "data-thread-title",
        data: { threadId: "thread_1", title: "x", renamed: "yes" },
      },
      { type: "source-url", sourceId: "source_1", url: "not a url" },
      {
        type: "source-url",
        sourceId: "source_1",
        url: `https://example.com/${"x".repeat(2_100)}`,
      },
    ]
    for (const part of invalidParts) {
      const projected = sanitizeAssistantMessage({
        id: "assistant_invalid_trace",
        role: "assistant",
        parts: [part],
      })
      expect(projected.parts).toEqual([
        { type: "text", text: "応答を完了できませんでした。" },
      ])
    }

    const deep: Record<string, unknown> = { value: true }
    let nested = deep
    for (let index = 0; index < 10; index += 1) {
      const next: Record<string, unknown> = {}
      nested.next = next
      nested = next
    }
    const tool = sanitizeAssistantMessage({
      id: "assistant_unsafe_json",
      role: "assistant",
      parts: [
        {
          type: "tool-search_issues",
          toolCallId: "call_json",
          state: "input-available",
          input: {
            ["x".repeat(129)]: "discarded",
            array: [undefined, Number.POSITIVE_INFINITY, null, false, 1, "ok"],
            deep,
          },
        },
      ],
    })
    expect(JSON.stringify(tool)).not.toContain("discarded")
    expect(JSON.stringify(tool)).not.toContain("Infinity")
  })

  it("passes canonical text and completed tool results to model history", () => {
    expect(
      toModelUiMessages([
        {
          id: "user_1",
          role: "user",
          parts: [
            { type: "text", text: "Hello" },
            { type: "data-agent-assets", data: { assetIds: ["asset_1"] } },
          ],
        },
        {
          id: "assistant_1",
          role: "assistant",
          parts: [
            {
              type: "tool-ui_navigate",
              toolCallId: "call_1",
              state: "output-available",
              input: { page: "issues" },
              output: { ok: true },
            },
          ],
        },
      ])
    ).toEqual([
      { id: "user_1", role: "user", parts: [{ type: "text", text: "Hello" }] },
      {
        id: "assistant_1",
        role: "assistant",
        parts: [
          {
            type: "tool-ui_navigate",
            toolCallId: "call_1",
            state: "output-available",
            input: { page: "issues" },
            output: { ok: true },
          },
        ],
      },
    ])
  })

  it("removes historical Issue write proposal turns from later model context", () => {
    expect(
      toModelUiMessages([
        {
          id: "user_rejected",
          role: "user",
          parts: [{ type: "text", text: "Create the rejected title" }],
        },
        {
          id: "assistant_rejected",
          role: "assistant",
          parts: [
            { type: "text", text: "I prepared the rejected title." },
            {
              type: "tool-create_issue",
              toolCallId: "call_rejected",
              state: "output-available",
              input: { title: "Rejected title" },
              output: { status: "pending", actionId: "action_rejected" },
            },
          ],
        },
        {
          id: "user_current",
          role: "user",
          parts: [{ type: "text", text: "Create the approved title" }],
        },
      ])
    ).toEqual([
      {
        id: "user_current",
        role: "user",
        parts: [{ type: "text", text: "Create the approved title" }],
      },
    ])
  })

  it("converts every persisted tool state into a valid model history part", () => {
    expect(
      toModelUiMessages([
        {
          id: "assistant_states",
          role: "assistant",
          parts: [
            {
              type: "tool-ui_navigate",
              toolCallId: "call_input",
              state: "input-available",
            },
            {
              type: "tool-ui_open_issue",
              toolCallId: "call_output",
              state: "output-available",
            },
            {
              type: "tool-ui_set_issue_query",
              toolCallId: "call_error",
              state: "output-error",
            },
            {
              type: "tool-ui_read_form_draft",
              toolCallId: "call_denied",
              state: "output-denied",
            },
          ],
        },
        {
          id: "user_assets_only",
          role: "user",
          parts: [
            { type: "data-agent-assets", data: { assetIds: ["asset_1"] } },
          ],
        },
      ])
    ).toEqual([
      {
        id: "assistant_states",
        role: "assistant",
        parts: [
          {
            type: "tool-ui_navigate",
            toolCallId: "call_input",
            state: "input-available",
            input: null,
          },
          {
            type: "tool-ui_open_issue",
            toolCallId: "call_output",
            state: "output-available",
            input: null,
            output: null,
          },
          {
            type: "tool-ui_set_issue_query",
            toolCallId: "call_error",
            state: "output-error",
            input: null,
            errorText: "Tool failed.",
          },
          {
            type: "tool-ui_read_form_draft",
            toolCallId: "call_denied",
            state: "output-error",
            input: null,
            errorText: "Tool output was denied.",
          },
        ],
      },
    ])
  })
})
