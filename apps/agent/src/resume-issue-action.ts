import type { AgentActionExecutionResult } from "@enterprise-agentic-saas/api/agent-client"
import { RequestContext } from "@mastra/core/request-context"
import { z } from "zod"

import type { AgentFeatureSwitches } from "./feature-flags"
import type { AgentInternalGateway } from "./internal-api"
import { mastra } from "./mastra"
import type { ApprovedIssueActionRuntime } from "./mastra/workflows/approved-issue-action"

type ResumeIssueActionApi = Pick<
  AgentInternalGateway,
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
  }
): Promise<AgentActionExecutionResult> => {
  const parsed = resumeIssueActionSchema.safeParse(input)
  if (
    !parsed.success ||
    !dependencies.features.runs ||
    !dependencies.features.writes
  ) {
    throw new Error("Issue action resume is unavailable")
  }

  try {
    const requestContext = new RequestContext()
    requestContext.set("approvedIssueActionRuntime", {
      api: dependencies.api,
      features: dependencies.features,
      resumeTicket: parsed.data.resumeTicket,
    } satisfies ApprovedIssueActionRuntime)
    const workflow = mastra.getWorkflow("approvedIssueActionWorkflow")
    const run = await workflow.createRun()
    const result = await run.start({
      inputData: { actionId: parsed.data.actionId },
      requestContext,
    })
    if (result.status !== "success") {
      throw new Error("Issue action resume is unavailable")
    }
    return result.result
  } catch {
    throw new Error("Issue action resume is unavailable")
  }
}
