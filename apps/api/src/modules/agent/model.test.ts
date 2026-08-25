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

describe("Agent公開HTTP input schema", () => {
  it.each([
    {
      expected: true,
      label: "safe integer上限",
      page: String(Number.MAX_SAFE_INTEGER),
    },
    {
      expected: false,
      label: "safe integer超過",
      page: String(Number.MAX_SAFE_INTEGER + 1),
    },
    { expected: false, label: "過長な数値文字列", page: "9".repeat(10_000) },
  ] as const)("$labelのpageを上限内だけ受理する", ({ expected, page }) => {
    const result = v.safeParse(agentMessagePageQueryModel, {
      page,
      perPage: "100",
    })
    const expectedResult = expected
      ? { output: { page: Number(page), perPage: 100 }, success: true }
      : { success: false }
    expect(result).toMatchObject(expectedResult)
  })

  it.each([
    { expected: true, label: "上限", perPage: "100" },
    { expected: false, label: "上限超過", perPage: "101" },
    {
      expected: false,
      label: "過長な数値文字列",
      perPage: "9".repeat(10_000),
    },
  ] as const)(
    "$labelのperPageを上限内だけ受理する",
    ({ expected, perPage }) => {
      const result = v.safeParse(agentMessagePageQueryModel, {
        page: "0",
        perPage,
      })
      const expectedResult = expected
        ? { output: { page: 0, perPage: Number(perPage) }, success: true }
        : { success: false }
      expect(result).toMatchObject(expectedResult)
    }
  )

  it("公開Issue revisionをsafe integer上限へ収める", () => {
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
  })

  it("公開Issue番号をsafe integer上限へ収める", () => {
    expect(
      v.safeParse(getAgentIssueInputModel, {
        grant: "g".repeat(32),
        lookup: "number",
        number: Number.MAX_SAFE_INTEGER,
      }).success
    ).toBe(true)
    expect(
      v.safeParse(getAgentIssueInputModel, {
        grant: "g".repeat(32),
        lookup: "number",
        number: Number.MAX_SAFE_INTEGER + 1,
      }).success
    ).toBe(false)
  })
})
