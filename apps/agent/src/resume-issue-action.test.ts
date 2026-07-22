import type { AgentInternalApiContract } from "@enterprise-agentic-saas/api/agent-client"
import { describe, expect, it, vi } from "vitest"

import { resumeIssueAction } from "./resume-issue-action"

const ACTION_ID = "action_1"
const RESUME_TICKET = "ticket_0123456789abcdefghijklmnopqrstuvwxyz"
const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"
type ResumeApi = Pick<
  AgentInternalApiContract,
  "cancelRun" | "executeApprovedAction" | "finishRun" | "resumeApprovedAction"
>

const harness = () => {
  const cancelRun = vi.fn<ResumeApi["cancelRun"]>().mockResolvedValue({
    runId: "run_2",
    status: "canceled",
  })
  const resumeApprovedAction = vi
    .fn<ResumeApi["resumeApprovedAction"]>()
    .mockResolvedValue({
      expiresAt: "2999-07-22T00:00:00.000Z",
      grant: RUN_GRANT,
      rootRunId: "root_1",
      runId: "run_2",
    })
  const executeApprovedAction = vi
    .fn<ResumeApi["executeApprovedAction"]>()
    .mockResolvedValue({
      actionId: ACTION_ID,
      issue: { deleted: false, id: "issue_1", number: 1, revision: 1 },
      kind: "create_issue",
      status: "succeeded",
    })
  const finishRun = vi.fn<ResumeApi["finishRun"]>().mockResolvedValue({
    runId: "run_2",
    status: "completed",
  })
  return {
    api: {
      cancelRun,
      executeApprovedAction,
      finishRun,
      resumeApprovedAction,
    },
    executeApprovedAction,
    finishRun,
    resumeApprovedAction,
  }
}

const enabled = { runs: true, vision: true, writes: true }

describe("resumeIssueAction", () => {
  it("requires a live connection and fail-closed run/write switches", async () => {
    const cases = [
      { features: enabled, liveConnection: false },
      {
        features: { runs: false, vision: true, writes: true },
        liveConnection: true,
      },
      {
        features: { runs: true, vision: true, writes: false },
        liveConnection: true,
      },
    ]
    await Promise.all(
      cases.map(async (dependencies) => {
        const test = harness()
        await expect(
          resumeIssueAction(
            { actionId: ACTION_ID, resumeTicket: RESUME_TICKET },
            { api: test.api, ...dependencies }
          )
        ).rejects.toThrow("Issue action resume is unavailable")
        expect(test.resumeApprovedAction).not.toHaveBeenCalled()
      })
    )
  })

  it("atomically consumes the ticket, executes with the fresh grant, and settles", async () => {
    const test = harness()
    const receipt = await resumeIssueAction(
      { actionId: ACTION_ID, resumeTicket: RESUME_TICKET },
      { api: test.api, features: enabled, liveConnection: true }
    )

    expect(test.resumeApprovedAction).toHaveBeenCalledWith({
      actionId: ACTION_ID,
      resumeTicket: RESUME_TICKET,
    })
    expect(test.executeApprovedAction).toHaveBeenCalledWith({
      actionId: ACTION_ID,
      grant: RUN_GRANT,
    })
    expect(test.finishRun).toHaveBeenCalledWith({
      grant: RUN_GRANT,
      outcome: "completed",
    })
    expect(receipt).toEqual({
      actionId: ACTION_ID,
      issue: { deleted: false, id: "issue_1", number: 1, revision: 1 },
      kind: "create_issue",
      status: "succeeded",
    })
    expect(JSON.stringify(receipt)).not.toContain(RESUME_TICKET)
    expect(JSON.stringify(receipt)).not.toContain(RUN_GRANT)
  })

  it("settles the continuation as failed and hides execution details", async () => {
    const test = harness()
    test.executeApprovedAction.mockRejectedValue(
      new Error(`private ${RESUME_TICKET} ${RUN_GRANT}`)
    )

    await expect(
      resumeIssueAction(
        { actionId: ACTION_ID, resumeTicket: RESUME_TICKET },
        { api: test.api, features: enabled, liveConnection: true }
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(test.finishRun).toHaveBeenCalledWith({
      grant: RUN_GRANT,
      outcome: "failed",
    })
  })

  it("hides ticket-consumption failures and rejects an invalid fresh grant", async () => {
    const failed = harness()
    failed.resumeApprovedAction.mockRejectedValue(
      new Error(`private ${RESUME_TICKET}`)
    )
    await expect(
      resumeIssueAction(
        { actionId: ACTION_ID, resumeTicket: RESUME_TICKET },
        { api: failed.api, features: enabled, liveConnection: true }
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(failed.executeApprovedAction).not.toHaveBeenCalled()

    const invalid = harness()
    invalid.resumeApprovedAction.mockResolvedValue({
      expiresAt: "2000-07-22T00:00:00.000Z",
      grant: "invalid",
      rootRunId: "root_1",
      runId: "run_2",
    })
    await expect(
      resumeIssueAction(
        { actionId: ACTION_ID, resumeTicket: RESUME_TICKET },
        { api: invalid.api, features: enabled, liveConnection: true }
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(invalid.executeApprovedAction).not.toHaveBeenCalled()
  })

  it("rejects malformed and over-posted RPC payloads before consuming", async () => {
    const test = harness()
    await expect(
      resumeIssueAction(
        {
          actionId: ACTION_ID,
          extra: "secret",
          resumeTicket: RESUME_TICKET,
        },
        { api: test.api, features: enabled, liveConnection: true }
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(test.resumeApprovedAction).not.toHaveBeenCalled()
  })
})
