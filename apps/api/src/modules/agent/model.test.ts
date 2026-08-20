import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { updateIssueActionPayloadModel } from "./action-schema"
import { agentChatBodyModel, agentMessagePageQueryModel } from "./model"
import { getAgentIssueInputModel } from "./runtime-schema"

const continuationBody = (revision: number) => ({
  assistantMessageId: "assistant_1",
  clientToolResults: [
    {
      input: { formId: "form_1" },
      output: {
        dirtyFields: [],
        epoch: "epoch_1",
        formId: "form_1",
        resource: "issue",
        revision,
        values: {},
      },
      state: "output-available",
      toolCallId: "call_1",
      toolName: "ui_read_form_draft",
    },
  ],
  threadId: "thread_1",
  timezone: "Asia/Tokyo",
})

describe("Agent public HTTP input schemas", () => {
  it("bounds pagination before and after string conversion", () => {
    expect(
      v.parse(agentMessagePageQueryModel, {
        page: String(Number.MAX_SAFE_INTEGER),
        perPage: "100",
      })
    ).toEqual({ page: Number.MAX_SAFE_INTEGER, perPage: 100 })
    for (const query of [
      { page: String(Number.MAX_SAFE_INTEGER + 1), perPage: "100" },
      { page: "9".repeat(10_000), perPage: "100" },
      { page: "0", perPage: "101" },
      { page: "0", perPage: "9".repeat(10_000) },
    ]) {
      expect(v.safeParse(agentMessagePageQueryModel, query).success).toBe(false)
    }
  })

  it("bounds every public Issue revision and number at the safe integer limit", () => {
    expect(
      v.safeParse(agentChatBodyModel, continuationBody(Number.MAX_SAFE_INTEGER))
        .success
    ).toBe(true)
    expect(
      v.safeParse(
        agentChatBodyModel,
        continuationBody(Number.MAX_SAFE_INTEGER + 1)
      ).success
    ).toBe(false)
    expect(
      v.safeParse(updateIssueActionPayloadModel, {
        expectedRevision: Number.MAX_SAFE_INTEGER,
        issueId: "issue_1",
        title: "Title",
      }).success
    ).toBe(true)
    expect(
      v.safeParse(updateIssueActionPayloadModel, {
        expectedRevision: Number.MAX_SAFE_INTEGER + 1,
        issueId: "issue_1",
        title: "Title",
      }).success
    ).toBe(false)
    expect(
      v.safeParse(getAgentIssueInputModel, {
        grant: "g".repeat(32),
        lookup: "number",
        number: Number.MAX_SAFE_INTEGER + 1,
      }).success
    ).toBe(false)
  })
})
