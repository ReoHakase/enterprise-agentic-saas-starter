import { describe, expect, it } from "vitest"

import { assertWebSearchEvidence } from "./stack-driver"

const successEvents = (assistantUrl: string) => [
  {
    type: "tool-input-available",
    toolCallId: "call_search",
    toolName: "web_search",
    input: { query: "public query" },
  },
  {
    type: "tool-output-available",
    toolCallId: "call_search",
    output: {
      content: "Public result",
      sources: [
        {
          title: "Official source",
          url: "https://developers.cloudflare.com/workers/",
        },
      ],
      trust: "untrusted_public_web_content",
    },
  },
  {
    type: "text-delta",
    delta: `See [the official documentation](${assistantUrl}).`,
  },
]

describe("assertWebSearchEvidenceの契約", () => {
  it("有界な成功tool出力からcitationを受け入れる", () => {
    expect(() =>
      assertWebSearchEvidence(
        successEvents("https://developers.cloudflare.com/workers/")
      )
    ).not.toThrow()
  })

  it("tool state更新時は最終出力を使う", () => {
    expect(() =>
      assertWebSearchEvidence([
        {
          type: "tool-output-available",
          toolCallId: "call_search",
          output: {
            content: "",
            sources: [],
            trust: "untrusted_public_web_content",
          },
        },
        ...successEvents("https://developers.cloudflare.com/workers/"),
      ])
    ).not.toThrow()
  })

  it("assistant textを受け入れずtool-output-errorを拒否する", () => {
    expect(() =>
      assertWebSearchEvidence([
        {
          type: "tool-input-available",
          toolCallId: "call_search",
          toolName: "web_search",
          input: { query: "public query" },
        },
        {
          type: "tool-output-error",
          toolCallId: "call_search",
          errorText: "Search failed",
        },
        {
          type: "text-delta",
          delta: "https://developers.cloudflare.com/workers/",
        },
      ])
    ).toThrow("tool failed")
  })

  it("欠損と不正と空と無界のsource出力を区別する", () => {
    const input = {
      type: "tool-input-available",
      toolCallId: "call_search",
      toolName: "web_search",
      input: { query: "public query" },
    }
    expect(() => assertWebSearchEvidence([input])).toThrow("event was missing")
    expect(() =>
      assertWebSearchEvidence([
        input,
        {
          type: "tool-output-available",
          toolCallId: "call_search",
          output: {},
        },
      ])
    ).toThrow("shape was invalid")
    expect(() =>
      assertWebSearchEvidence([
        input,
        {
          type: "tool-output-available",
          toolCallId: "call_search",
          output: { sources: [] },
        },
      ])
    ).toThrow("no bounded sources")
    expect(() =>
      assertWebSearchEvidence([
        input,
        {
          type: "tool-output-available",
          toolCallId: "call_search",
          output: {
            sources: Array.from({ length: 6 }, () => ({
              url: "https://example.com/",
            })),
          },
        },
      ])
    ).toThrow("exceeded its source bound")
  })

  it("返却source集合外の幻覚citationを拒否する", () => {
    expect(() =>
      assertWebSearchEvidence(successEvents("https://example.com/invented"))
    ).toThrow("was not returned by tool")
  })
})
