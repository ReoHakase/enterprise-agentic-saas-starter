import { describe, expect, it } from "vitest"

import { prepareAgentChatBody } from "./chat-transport"
import type { AgentChatMessage } from "./schema"

const historicalMessage: AgentChatMessage = {
  id: "message-1",
  role: "assistant",
  parts: [{ type: "text", text: "Earlier server-owned history" }],
}
const userMessage: AgentChatMessage = {
  id: "message-2",
  role: "user",
  parts: [
    { type: "text", text: "Create an issue for this screenshot" },
    {
      type: "data-agent-assets",
      data: {
        assetIds: ["asset-1"],
        assets: [
          {
            id: "asset-1",
            filename: "bug.png",
            sizeBytes: 100,
            imageWidth: 640,
            imageHeight: 480,
            expiresAt: "2026-07-25T00:00:00.000Z",
          },
        ],
      },
    },
  ],
}
const messages: AgentChatMessage[] = [historicalMessage, userMessage]

const continuationMessages: AgentChatMessage[] = [
  ...messages,
  {
    id: "assistant-message-1",
    role: "assistant",
    parts: [
      { type: "text", text: "I will update the visible query." },
      { type: "step-start" },
      {
        type: "dynamic-tool",
        toolName: "ui_set_issue_query",
        toolCallId: "tool-call-1",
        state: "output-available",
        input: { query: { priority: "high" } },
        output: {
          ok: true,
          query: {
            q: "",
            status: "all",
            priority: "high",
            assignee: "",
            label: "",
            sort: "updatedAt",
            dir: "desc",
            page: 1,
          },
        },
      },
      {
        type: "dynamic-tool",
        toolName: "ui_open_issue",
        toolCallId: "tool-call-2",
        state: "output-error",
        input: { issueNumber: 42 },
        errorText: "The Issue is no longer available.",
      },
    ],
  },
]

describe("Agent chat transport", () => {
  it("sends only the latest user text and asset IDs derived from its data part", () => {
    expect(
      prepareAgentChatBody({
        threadId: "thread-1",
        messages,
        timezone: "Asia/Tokyo",
      })
    ).toEqual({
      threadId: "thread-1",
      message: {
        id: "message-2",
        role: "user",
        parts: [{ type: "text", text: "Create an issue for this screenshot" }],
      },
      assetIds: ["asset-1"],
      timezone: "Asia/Tokyo",
    })
  })

  it("sends only bounded client tool results for an automatic continuation", () => {
    expect(
      prepareAgentChatBody({
        threadId: "thread-1",
        messages: continuationMessages,
        timezone: "Asia/Tokyo",
      })
    ).toEqual({
      threadId: "thread-1",
      assistantMessageId: "assistant-message-1",
      clientToolResults: [
        {
          toolCallId: "tool-call-1",
          toolName: "ui_set_issue_query",
          state: "output-available",
          output: {
            ok: true,
            query: {
              q: "",
              status: "all",
              priority: "high",
              assignee: "",
              label: "",
              sort: "updatedAt",
              dir: "desc",
              page: 1,
            },
          },
        },
        {
          toolCallId: "tool-call-2",
          toolName: "ui_open_issue",
          state: "output-error",
          errorText: "The Issue is no longer available.",
        },
      ],
      timezone: "Asia/Tokyo",
    })
  })

  it("rejects duplicate assets and incomplete or over-broad client results", () => {
    expect(() =>
      prepareAgentChatBody({
        threadId: "thread-1",
        messages: [
          historicalMessage,
          {
            ...userMessage,
            parts: [
              { type: "text", text: "Duplicate" },
              {
                type: "data-agent-assets",
                data: { assetIds: ["asset-1", "asset-1"] },
              },
            ],
          },
        ],
        timezone: "Asia/Tokyo",
      })
    ).toThrow("Invalid Agent asset")

    const assistant = continuationMessages.at(-1)
    if (!assistant) throw new Error("Missing test assistant message")
    expect(() =>
      prepareAgentChatBody({
        threadId: "thread-1",
        messages: [
          {
            ...assistant,
            parts: [
              {
                type: "dynamic-tool",
                toolName: "ui_set_issue_query",
                toolCallId: "tool-call-1",
                state: "output-available",
                input: {},
                output: {
                  ok: true,
                  query: {
                    q: "",
                    status: "all",
                    priority: "all",
                    assignee: "",
                    label: "",
                    sort: "updatedAt",
                    dir: "desc",
                    page: 1,
                    agentThread: "must-not-leak",
                  },
                },
              },
            ],
          },
        ],
        timezone: "Asia/Tokyo",
      })
    ).toThrow(/agentThread/u)

    expect(() =>
      prepareAgentChatBody({
        threadId: "thread-1",
        messages: [
          {
            ...assistant,
            parts: [
              {
                type: "dynamic-tool",
                toolName: "ui_read_form_draft",
                toolCallId: "tool-call-3",
                state: "input-available",
                input: {},
              },
            ],
          },
        ],
        timezone: "Asia/Tokyo",
      })
    ).toThrow("incomplete")
  })
})
