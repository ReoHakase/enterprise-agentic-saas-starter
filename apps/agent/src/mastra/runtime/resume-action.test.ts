import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { mastra } from "../index"
import type { AgentControlPlanePort as AgentInternalGateway } from "./ports"
import { resumeIssueAction } from "./resume-action"

const ACTION_ID = "action_1"
const RESUME_TICKET = "ticket_0123456789abcdefghijklmnopqrstuvwxyz"
const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"
let workflowError: ReturnType<typeof vi.spyOn>

beforeAll(() => {
  workflowError = vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterAll(() => workflowError.mockRestore())
type ResumeApi = Pick<
  AgentInternalGateway,
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
      attempt: 1,
      expiresAt: "2999-07-22T00:00:00.000Z",
      grant: RUN_GRANT,
      rootRunId: "root_1",
      runId: "run_2",
      shouldGenerateTitle: false,
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
  it("requires fail-closed run/write switches", async () => {
    const cases = [
      { features: { runs: false, vision: true, writes: true } },
      { features: { runs: true, vision: true, writes: false } },
    ]
    await Promise.all(
      cases.map(async (dependencies) => {
        const test = harness()
        await expect(
          resumeIssueAction(
            { actionId: ACTION_ID, resumeTicket: RESUME_TICKET },
            { api: test.api, mastra, ...dependencies }
          )
        ).rejects.toThrow("Issue action resume is unavailable")
        expect(test.resumeApprovedAction).not.toHaveBeenCalled()
      })
    )
  })

  it("atomically consumes the ticket, executes with the fresh grant, and settles", async () => {
    const test = harness()
    const workflowLookup = vi.spyOn(mastra, "getWorkflow")
    const receipt = await resumeIssueAction(
      { actionId: ACTION_ID, resumeTicket: RESUME_TICKET },
      { api: test.api, features: enabled, mastra }
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
    expect(workflowLookup).toHaveBeenCalledWith("approvedIssueActionWorkflow")
    workflowLookup.mockRestore()
  })

  it("settles the continuation as failed and hides execution details", async () => {
    const test = harness()
    test.executeApprovedAction.mockRejectedValue(
      new Error(`private ${RESUME_TICKET} ${RUN_GRANT}`)
    )

    await expect(
      resumeIssueAction(
        { actionId: ACTION_ID, resumeTicket: RESUME_TICKET },
        { api: test.api, features: enabled, mastra }
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
        { api: failed.api, features: enabled, mastra }
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(failed.executeApprovedAction).not.toHaveBeenCalled()

    const invalid = harness()
    invalid.resumeApprovedAction.mockResolvedValue({
      attempt: 1,
      expiresAt: "2000-07-22T00:00:00.000Z",
      grant: "invalid",
      rootRunId: "root_1",
      runId: "run_2",
      shouldGenerateTitle: false,
    })
    await expect(
      resumeIssueAction(
        { actionId: ACTION_ID, resumeTicket: RESUME_TICKET },
        { api: invalid.api, features: enabled, mastra }
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(invalid.executeApprovedAction).not.toHaveBeenCalled()
  })

  it("rejects malformed and over-posted resume payloads before consuming", async () => {
    const test = harness()
    await expect(
      resumeIssueAction(
        {
          actionId: ACTION_ID,
          extra: "secret",
          resumeTicket: RESUME_TICKET,
        },
        { api: test.api, features: enabled, mastra }
      )
    ).rejects.toThrow("Issue action resume is unavailable")
    expect(test.resumeApprovedAction).not.toHaveBeenCalled()
  })
})
