import { describe, expect, it, vi } from "vitest"

import { agentClientToolSchemas } from "./schema"
import { createAgentClientTools } from "./tool"

describe("agentClientToolSchemas", () => {
  it("keeps every provider schema JSON-serializable", () => {
    for (const schema of Object.values(agentClientToolSchemas)) {
      expect(
        schema["~standard"].jsonSchema.input({ target: "draft-07" })
      ).toMatchObject({
        additionalProperties: false,
        type: "object",
      })
    }
  })

  it("matches the five strict browser contracts", () => {
    const jsonSchemas = Object.fromEntries(
      Object.entries(agentClientToolSchemas).map(([name, schema]) => [
        name,
        schema["~standard"].jsonSchema.input({ target: "draft-07" }),
      ])
    )
    expect(jsonSchemas.navigate).toMatchObject({
      additionalProperties: false,
      properties: {
        page: { enum: ["dashboard", "issues", "agent", "members"] },
      },
      required: ["page"],
    })
    expect(jsonSchemas.patchFormDraft).toMatchObject({
      additionalProperties: false,
      properties: {
        expectedEpoch: { maxLength: 128, minLength: 1 },
        expectedRevision: { minimum: 1, type: "integer" },
        formId: { maxLength: 128, minLength: 1 },
        patch: {
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            title: { type: "string" },
          },
        },
      },
      required: ["expectedEpoch", "expectedRevision", "formId", "patch"],
    })
    expect(jsonSchemas.setIssueQuery).toMatchObject({
      additionalProperties: false,
      properties: {
        query: {
          additionalProperties: false,
          properties: { page: { maximum: 100_000, minimum: 1 } },
        },
      },
      required: ["query"],
    })
  })
})

describe("createAgentClientTools", () => {
  it("defines exactly five client-executed tools and charges their shared budget", async () => {
    const consume = vi.fn<(kind: "client" | "read" | "write") => void>()
    const tools = createAgentClientTools({
      consume,
      suspendForApproval: vi.fn<() => void>(),
    })

    expect(Object.keys(tools).toSorted()).toEqual([
      "ui_navigate",
      "ui_open_issue",
      "ui_patch_form_draft",
      "ui_read_form_draft",
      "ui_set_issue_query",
    ])
    expect(tools.ui_navigate.execute).toBeUndefined()

    await tools.ui_navigate.onInputAvailable?.({
      input: { page: "issues" },
      messages: [],
      toolCallId: "call_1",
    })
    expect(consume).toHaveBeenCalledWith("client")
  })
})
