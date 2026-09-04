import { describe, expect, it } from "vitest"

import { projectAgentE2EHistory } from "./agent-e2e-projection"

describe("有料Agent E2E履歴の表示用変換", () => {
  it.each([
    "providerMetadata",
    "callProviderMetadata",
    "resultProviderMetadata",
    "toolMetadata",
    "providerResponse",
    "rawBody",
    "rawResponse",
    "responseText",
  ])("プロバイダーの非公開フィールド%sを検出する", (key) => {
    const projection = projectAgentE2EHistory(
      { nested: { [key]: "PRIVATE_PROVIDER_SENTINEL" } },
      true
    )

    expect(projection).toMatchObject({
      bounded: true,
      hasRawProviderField: true,
      responseOk: true,
    })
  })

  it("循環入力をシリアル化せずに制限する", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(projectAgentE2EHistory(cyclic, true)).toMatchObject({
      bounded: false,
      responseOk: true,
    })
  })

  it("保存済みアシスタント本文と公開情報源を複製せずに表示用変換する", () => {
    const projection = projectAgentE2EHistory(
      {
        messages: [
          {
            role: "assistant",
            parts: [
              { type: "text", text: "PRIVATE_ASSISTANT_SENTINEL" },
              { type: "source-url", url: "https://example.com/docs" },
            ],
          },
        ],
      },
      true
    )

    expect(projection).toMatchObject({
      assistantAnswerAvailable: true,
      bounded: true,
      hasPrivateUrl: false,
      hasPublicUrl: true,
      responseOk: true,
    })
    expect(JSON.stringify(projection)).not.toContain(
      "PRIVATE_ASSISTANT_SENTINEL"
    )
    expect(JSON.stringify(projection)).not.toContain("example.com")
  })

  it("非公開出力を複製せずに期待するget_issue優先度を表示用変換する", () => {
    const projection = projectAgentE2EHistory(
      {
        messages: [
          {
            role: "assistant",
            parts: [
              {
                type: "tool-get_issue",
                toolCallId: "PRIVATE_TOOL_CALL_SENTINEL",
                state: "output-available",
                input: {
                  lookup: "number",
                  number: 42,
                },
                output: {
                  description: "PRIVATE_ISSUE_BODY_SENTINEL",
                  number: 42,
                  priority: "urgent",
                  title: "PRIVATE_ISSUE_TITLE_SENTINEL",
                },
              },
            ],
          },
        ],
      },
      true
    )

    expect(projection).toMatchObject({
      bounded: true,
      getIssueInputAvailable: true,
      getIssueOutputAvailable: true,
      getIssuePartAvailable: true,
      getIssuePriorityUrgent: true,
      responseOk: true,
    })
    expect(JSON.stringify(projection)).not.toMatch(/PRIVATE_(?:ISSUE|TOOL)_/u)
  })

  it("緊急でないget_issue出力は受け入れない", () => {
    expect(
      projectAgentE2EHistory(
        {
          type: "tool-get_issue",
          state: "output-available",
          output: { priority: "high" },
        },
        true
      )
    ).toMatchObject({
      getIssueInputAvailable: false,
      getIssueOutputAvailable: true,
      getIssuePartAvailable: true,
      getIssuePriorityUrgent: false,
    })
  })

  it("不完全なget_issue呼び出しと欠落している部分を区別する", () => {
    expect(
      projectAgentE2EHistory(
        {
          type: "tool-get_issue",
          state: "input-available",
          input: { lookup: "number", number: 42 },
        },
        true
      )
    ).toMatchObject({
      getIssueInputAvailable: true,
      getIssueOutputAvailable: false,
      getIssuePartAvailable: true,
    })
  })
})
