import {
  agentIdentifierSchema,
  type AgentActionExecutionResult,
} from "@enterprise-agentic-saas/agent-contracts"
import type { Mastra } from "@mastra/core/mastra"
import { createWorkflowStateReader } from "@mastra/core/workflows"
import * as v from "valibot"

import type { AgentFeatureSwitches } from "../core/policy/feature-flags"
import type { ApprovedIssueActionExecutionRegistry } from "../workflows/approved-issue-action"
import type { AgentControlPlanePort } from "./ports"

type ResumeIssueActionApi = Pick<
  AgentControlPlanePort,
  "executeApprovedAction" | "finalizeRun" | "resumeApprovedAction"
>

const resumeIssueActionSchema = v.strictObject({
  actionId: agentIdentifierSchema,
  resumeTicket: v.pipe(
    v.string(),
    v.minLength(32),
    v.maxLength(512),
    v.regex(/^[A-Za-z0-9._~-]+$/)
  ),
})

export const resumeIssueAction = async (
  input: unknown,
  dependencies: {
    api: ResumeIssueActionApi
    captureSettlementFailure?: () => void
    executionRegistry: ApprovedIssueActionExecutionRegistry
    features: AgentFeatureSwitches
    mastra: Mastra
    reportFailure?: (cause: unknown) => void
    signal: AbortSignal
  }
): Promise<AgentActionExecutionResult> => {
  const parsed = v.safeParse(resumeIssueActionSchema, input)
  if (
    !parsed.success ||
    !dependencies.features.runs ||
    !dependencies.features.writes ||
    dependencies.signal.aborted
  ) {
    throw new Error("Issue action resume is unavailable")
  }

  const workflow = dependencies.mastra.getWorkflow(
    "approvedIssueActionWorkflow"
  )
  const state = await workflow.getWorkflowRunById(parsed.output.actionId)
  const suspended = state
    ? createWorkflowStateReader(state).getSuspendedStep()
    : undefined
  if (
    state?.status !== "suspended" ||
    suspended?.stepId !== "await-issue-action-approval" ||
    dependencies.signal.aborted
  ) {
    throw new Error("Issue action resume is unavailable")
  }

  const execution = dependencies.executionRegistry.register({
    api: dependencies.api,
    captureSettlementFailure: dependencies.captureSettlementFailure,
    features: dependencies.features,
    reportFailure: dependencies.reportFailure,
    resumeTicket: parsed.output.resumeTicket,
    signal: dependencies.signal,
  })
  try {
    const run = await workflow.createRun({ runId: parsed.output.actionId })
    const result = await run.resume({
      label: "approval",
      step: suspended.stepId,
      resumeData: {
        actionId: parsed.output.actionId,
        executionId: execution.executionId,
      },
      tracingOptions: { hideInput: true, hideOutput: true },
    })
    if (result.status !== "success") {
      throw new Error("Issue action resume is unavailable")
    }
    return result.result
  } catch (cause) {
    execution.release()
    throw new Error("Issue action resume is unavailable", { cause })
  }
}
