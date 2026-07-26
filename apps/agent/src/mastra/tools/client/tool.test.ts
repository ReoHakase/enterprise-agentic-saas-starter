import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { agentClientToolSchemas } from "./schema"
import { createAgentClientTools } from "./tool"

describe("agentClientToolSchemas", () => {
  it("keeps every provider schema JSON-serializable", () => {
    for (const schema of Object.values(agentClientToolSchemas)) {
      expect(z.toJSONSchema(schema)).toMatchObject({
        additionalProperties: false,
        type: "object",
      })
    }
  })

  it("matches the five strict browser contracts", () => {
    expect(agentClientToolSchemas.navigate.parse({ page: "issues" })).toEqual({
      page: "issues",
    })
    expect(
      agentClientToolSchemas.setIssueQuery.parse({
        query: { page: 2, priority: "urgent", q: "outage" },
      })
    ).toEqual({
      query: { page: 2, priority: "urgent", q: "outage" },
    })
    expect(
      agentClientToolSchemas.patchFormDraft.parse({
        expectedEpoch: "epoch_1",
        expectedRevision: 2,
        formId: "issue-edit-1",
        patch: { title: "New title" },
      })
    ).toEqual({
      expectedEpoch: "epoch_1",
      expectedRevision: 2,
      formId: "issue-edit-1",
      patch: { title: "New title" },
    })
    expect(
      agentClientToolSchemas.patchFormDraft.safeParse({
        expectedEpoch: "epoch_2",
        formId: "issue-edit-2",
        patch: { description: "Draft" },
      }).success
    ).toBe(false)
    expect(agentClientToolSchemas.readFormDraft.parse({})).toEqual({})
  })

  it("rejects unknown fields and out-of-range values", () => {
    expect(
      agentClientToolSchemas.navigate.safeParse({
        page: "https://example.com",
      }).success
    ).toBe(false)
    expect(
      agentClientToolSchemas.setIssueQuery.safeParse({
        query: { page: 100_001 },
      }).success
    ).toBe(false)
    expect(
      agentClientToolSchemas.readFormDraft.safeParse({ token: "secret" })
        .success
    ).toBe(false)
    expect(
      agentClientToolSchemas.patchFormDraft.safeParse({
        expectedEpoch: "epoch_1",
        formId: "issue-edit-1",
        patch: { title: "x", submit: true },
      }).success
    ).toBe(false)
    expect(
      agentClientToolSchemas.patchFormDraft.safeParse({
        expectedEpoch: "epoch_1",
        patch: { title: "x" },
      }).success
    ).toBe(false)
    expect(
      agentClientToolSchemas.patchFormDraft.safeParse({
        formId: "issue-edit-1",
        patch: { title: "x" },
      }).success
    ).toBe(false)
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
