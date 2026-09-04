import { describe, expect, it } from "vitest"

import { stopOnPendingIssueAction } from "./index"

const pendingResult = {
  output: {
    actionId: "action_1",
    expiresAt: "2026-07-22T01:00:00.000Z",
    preview: { kind: "create_issue" },
    requiresApproval: true,
    status: "pending",
  },
  toolName: "create_issue",
}

describe("stopOnPendingIssueActionの契約", () => {
  it("正規のpending Issue変更直後に停止する", () => {
    expect(
      stopOnPendingIssueAction({
        steps: [{ toolResults: [pendingResult] }],
      })
    ).toBe(true)
  })

  it.each(["add_issue_attachments", "remove_issue_attachments"])(
    "pending %s action後かつ次のmodel step前に停止する",
    (toolName) => {
      expect(
        stopOnPendingIssueAction({
          steps: [
            {
              toolResults: [
                {
                  ...pendingResult,
                  toolName,
                  output: {
                    ...pendingResult.output,
                    preview: { kind: "update_issue" },
                  },
                },
              ],
            },
          ],
        })
      ).toBe(true)
    }
  )

  it.each([
    { steps: [] },
    { steps: [{ toolResults: [] }] },
    {
      steps: [
        {
          toolResults: [
            { ...pendingResult, toolName: "read_active_organization" },
          ],
        },
      ],
    },
    {
      steps: [
        {
          toolResults: [
            {
              ...pendingResult,
              output: { ...pendingResult.output, status: "succeeded" },
            },
          ],
        },
      ],
    },
    {
      steps: [
        {
          toolResults: [
            {
              ...pendingResult,
              output: { ...pendingResult.output, actionId: "invalid id" },
            },
          ],
        },
      ],
    },
    {
      steps: [
        {
          toolResults: [
            {
              ...pendingResult,
              output: {
                ...pendingResult.output,
                preview: { kind: "delete_issue" },
              },
            },
          ],
        },
      ],
    },
    { steps: [{ toolResults: [null] }] },
  ])("非正規結果%#では停止しない", ({ steps }) => {
    expect(stopOnPendingIssueAction({ steps })).toBe(false)
  })
})
