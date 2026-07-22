import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"

import {
  sanitizeAssistantMessage,
  toModelUiMessages,
} from "./canonical-messages"

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
