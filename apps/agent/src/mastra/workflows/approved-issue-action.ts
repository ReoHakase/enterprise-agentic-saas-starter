import { createStep, createWorkflow } from "@mastra/core/workflows"
import { z } from "zod"

import type { AgentFeatureSwitches } from "../core/policy/feature-flags"
import { isActiveOpaqueGrant } from "../core/policy/grant"
import type { AgentControlPlanePort } from "../runtime/ports"
import { createRunSettlement } from "../runtime/settlement"
import { toSafeActionReceipt } from "../tools/issues/write/execute"

const identifierSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)

const inputSchema = z.object({ actionId: identifierSchema }).strict()
const outputSchema = z
  .object({
    actionId: identifierSchema,
    kind: z.enum(["create_issue", "update_issue", "delete_issue"]),
    status: z.literal("succeeded"),
    issue: z
      .object({
        id: identifierSchema,
        number: z.number().int().positive(),
        revision: z.number().int().positive(),
        deleted: z.boolean(),
      })
      .strict(),
  })
  .strict()

export type ApprovedIssueActionRuntime = {
  api: Pick<
    AgentControlPlanePort,
    "executeApprovedAction" | "cancelRun" | "finishRun" | "resumeApprovedAction"
  >
  features: AgentFeatureSwitches
  resumeTicket: string
}

const executeApprovedIssueAction = createStep({
  id: "execute-approved-issue-action",
  description:
    "Consume a one-time resume ticket, execute the approved API action, and settle its continuation run.",
  inputSchema,
  outputSchema,
  execute: async ({ inputData, requestContext }) => {
    const runtime = requestContext.get<
      "approvedIssueActionRuntime",
      ApprovedIssueActionRuntime | undefined
    >("approvedIssueActionRuntime")
    if (!runtime?.features.runs || !runtime.features.writes) {
      throw new Error("Issue action resume is unavailable")
    }

    let run
    try {
      // ticketはworkflow input/snapshotへ含めず、このprivate request contextから
      // APIのatomic consume routeへ一度だけ渡す。
      run = await runtime.api.resumeApprovedAction({
        actionId: inputData.actionId,
        resumeTicket: runtime.resumeTicket,
      })
    } catch {
      throw new Error("Issue action resume is unavailable")
    }
    if (!isActiveOpaqueGrant(run.grant, run.expiresAt)) {
      throw new Error("Issue action resume is unavailable")
    }

    const settlement = createRunSettlement(runtime.api, run.grant)
    try {
      const receipt = toSafeActionReceipt(
        await runtime.api.executeApprovedAction({
          actionId: inputData.actionId,
          grant: run.grant,
        }),
        { actionId: inputData.actionId }
      )
      await settlement.complete()
      return receipt
    } catch {
      await settlement.fail()
      throw new Error("Issue action resume is unavailable")
    }
  },
})

export const approvedIssueActionWorkflow = createWorkflow({
  id: "approved-issue-action",
  description:
    "Execute an API-approved Issue action through a fresh one-time continuation capability.",
  inputSchema,
  outputSchema,
})
  .then(executeApprovedIssueAction)
  .commit()
