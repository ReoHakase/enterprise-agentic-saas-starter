import { describe, expect, it } from "vitest"

import { projectAgentE2EHistory } from "./agent-e2e-projection"

describe("paid Agent E2E history projection", () => {
  it.each([
    "providerMetadata",
    "callProviderMetadata",
    "resultProviderMetadata",
    "toolMetadata",
    "providerResponse",
    "rawBody",
    "rawResponse",
    "responseText",
  ])("detects the private provider field %s", (key) => {
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

  it("bounds cyclic input without serializing it", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(projectAgentE2EHistory(cyclic, true)).toMatchObject({
      bounded: false,
      responseOk: true,
    })
  })

  it("projects persisted assistant text and public sources without copying either", () => {
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

  it("projects the expected get_issue priority without copying private output", () => {
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

  it("does not accept a non-urgent get_issue output", () => {
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

  it("distinguishes an incomplete get_issue call from a missing part", () => {
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
