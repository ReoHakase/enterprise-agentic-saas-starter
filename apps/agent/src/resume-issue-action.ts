import type {
  AgentActionExecutionResult,
  AgentInternalApiContract,
} from "@enterprise-agentic-saas/api/agent-client"
import { z } from "zod"

import { isActiveOpaqueGrant } from "./connection-grant"
import type { AgentFeatureSwitches } from "./feature-flags"
import { createRunSettlement } from "./run-settlement"
import { toSafeActionReceipt } from "./write-tools"

type ResumeIssueActionApi = Pick<
  AgentInternalApiContract,
  "executeApprovedAction" | "cancelRun" | "finishRun" | "resumeApprovedAction"
>

const resumeIssueActionSchema = z
  .object({
    actionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    resumeTicket: z
      .string()
      .min(32)
      .max(512)
      .regex(/^[A-Za-z0-9._~-]+$/),
  })
  .strict()

export type ResumeIssueActionInput = z.input<typeof resumeIssueActionSchema>

export const resumeIssueAction = async (
  input: unknown,
  dependencies: {
    api: ResumeIssueActionApi
    features: AgentFeatureSwitches
    liveConnection: boolean
  }
): Promise<AgentActionExecutionResult> => {
  const parsed = resumeIssueActionSchema.safeParse(input)
  if (
    !parsed.success ||
    !dependencies.liveConnection ||
    !dependencies.features.runs ||
    !dependencies.features.writes
  ) {
    throw new Error("Issue action resume is unavailable")
  }

  let run
  try {
    // resumeTicketはこのcall frameだけで保持し、APIでatomic consumeした後は再利用しない。
    run = await dependencies.api.resumeApprovedAction({
      actionId: parsed.data.actionId,
      resumeTicket: parsed.data.resumeTicket,
    })
  } catch {
    throw new Error("Issue action resume is unavailable")
  }
  if (!isActiveOpaqueGrant(run.grant, run.expiresAt)) {
    throw new Error("Issue action resume is unavailable")
  }

  const settlement = createRunSettlement(dependencies.api, run.grant)
  try {
    const receipt = toSafeActionReceipt(
      await dependencies.api.executeApprovedAction({
        actionId: parsed.data.actionId,
        grant: run.grant,
      }),
      { actionId: parsed.data.actionId }
    )
    await settlement.complete()
    return receipt
  } catch {
    await settlement.fail()
    throw new Error("Issue action resume is unavailable")
  }
}
