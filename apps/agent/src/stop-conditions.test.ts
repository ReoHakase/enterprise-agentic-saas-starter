import { describe, expect, it } from "vitest"

import { stopOnPendingIssueAction } from "./stop-conditions"

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

describe("stopOnPendingIssueAction", () => {
  it("stops immediately after a canonical pending Issue mutation", () => {
    expect(
      stopOnPendingIssueAction({
        steps: [{ toolResults: [pendingResult] }],
      })
    ).toBe(true)
  })

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
  ])("does not stop for non-canonical result %#", ({ steps }) => {
    expect(stopOnPendingIssueAction({ steps })).toBe(false)
  })
})
