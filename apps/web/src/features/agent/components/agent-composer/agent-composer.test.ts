import { describe, expect, it } from "vitest"

import { agentComposerDocumentToParts } from "../agent-composer-document/agent-composer-document"

describe("AgentComposerの文書projection", () => {
  it("テキストとインラインcontext参照を文書順に保持する", () => {
    expect(
      agentComposerDocumentToParts({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Compare " },
              {
                type: "mention",
                attrs: {
                  kind: "issue",
                  resourceId: "issue_1",
                  label: "Issue #7: Access regression",
                },
              },
              { type: "text", text: " with " },
              {
                type: "mention",
                attrs: {
                  kind: "current_page",
                  path: "/organization/acme/issues/7",
                  label: "Current page",
                },
              },
            ],
          },
          { type: "paragraph", content: [{ type: "text", text: "today" }] },
        ],
      })
    ).toEqual([
      { type: "text", text: "Compare " },
      {
        type: "data-context-reference",
        data: {
          kind: "issue",
          id: "issue_1",
          label: "Issue #7: Access regression",
        },
      },
      { type: "text", text: " with " },
      {
        type: "data-context-reference",
        data: {
          kind: "current_page",
          path: "/organization/acme/issues/7",
          label: "Current page",
        },
      },
      { type: "text", text: "\ntoday" },
    ])
  })

  it("識別子を作成する代わりに、不正なメンション属性を削除する", () => {
    expect(
      agentComposerDocumentToParts({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "mention", attrs: { kind: "issue", label: "Issue" } },
              { type: "text", text: "safe" },
            ],
          },
        ],
      })
    ).toEqual([{ type: "text", text: "safe" }])
  })
})
