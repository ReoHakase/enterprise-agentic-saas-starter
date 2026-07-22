import { describe, expect, it } from "vitest"

import { agentComposerDocumentToParts } from "./agent-composer"

describe("AgentComposer document projection", () => {
  it("preserves text and inline context references in document order", () => {
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

  it("drops malformed mention attributes instead of inventing identifiers", () => {
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
