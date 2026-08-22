import {
  agentActionExecutionResultSchema,
  agentIdentifierSchema,
  type AgentActionExecutionResult,
} from "@enterprise-agentic-saas/agent-contracts"
import { Mastra } from "@mastra/core/mastra"
import type { MastraCompositeStore } from "@mastra/core/storage"
import {
  createStep,
  createWorkflow,
  createWorkflowStateReader,
} from "@mastra/core/workflows"
import { toStandardJsonSchema } from "@valibot/to-json-schema"
import { jsonSchema } from "ai"
import * as v from "valibot"

import type { AgentFeatureSwitches } from "../../core/policy/feature-flags"
import { isActiveOpaqueGrant } from "../../core/policy/grant"
import type { AgentControlPlanePort } from "../../runtime/ports"
import { createRunSettlement } from "../../runtime/settlement"
import { toSafeActionReceipt } from "../../tools/issues/write/execute"
import { approvedIssueActionStepIds } from "./steps"

const actionInputSchema = v.strictObject({
  actionId: agentIdentifierSchema,
})
const actionResumeSchema = v.strictObject({
  actionId: agentIdentifierSchema,
  executionId: agentIdentifierSchema,
})
const canonicalOutputValidator = (
  value: unknown
):
  | { success: true; value: AgentActionExecutionResult }
  | { success: false; error: Error } => {
  const parsed = v.safeParse(agentActionExecutionResultSchema, value)
  return parsed.success
    ? { success: true, value: parsed.output }
    : { success: false, error: new Error("Workflow output is invalid") }
}
const inputSchema = toStandardJsonSchema(actionInputSchema)
const suspendedSchema = inputSchema
const resumeSchema = toStandardJsonSchema(actionResumeSchema)
const canonicalOutputStandardSchema = toStandardJsonSchema(
  agentActionExecutionResultSchema
)
const outputSchema = jsonSchema<AgentActionExecutionResult>(
  () =>
    canonicalOutputStandardSchema["~standard"].jsonSchema.output({
      target: "draft-07",
      libraryOptions: { ignoreActions: ["check_items"] },
    }),
  { validate: canonicalOutputValidator }
)

export type ApprovedIssueActionRuntime = {
  api: Pick<
    AgentControlPlanePort,
    "executeApprovedAction" | "finalizeRun" | "resumeApprovedAction"
  >
  captureSettlementFailure?: () => void
  features: AgentFeatureSwitches
  reportFailure?: (cause: unknown) => void
  resumeTicket: string
  signal: AbortSignal
}

const reportRuntimeFailure = (
  runtime: ApprovedIssueActionRuntime,
  cause: unknown
): void => {
  try {
    runtime.reportFailure?.(cause)
  } catch (reportingCause) {
    void reportingCause
    return
  }
}

// Workflow snapshots are durable. Keep the reported local cause out of the
// thrown value so provider details cannot be serialized into storage.
const workflowUnavailable = () =>
  new Error("Issue action resume is unavailable")

const requireActiveResumeRequest = (signal: AbortSignal): void => {
  if (signal.aborted) throw workflowUnavailable()
}

export class ApprovedIssueActionExecutionRegistry {
  readonly #executions = new Map<string, ApprovedIssueActionRuntime>()

  register(runtime: ApprovedIssueActionRuntime) {
    const executionId = `execution_${crypto.randomUUID()}`
    this.#executions.set(executionId, runtime)
    return {
      executionId,
      release: () => this.#executions.delete(executionId),
    }
  }

  take(executionId: string): ApprovedIssueActionRuntime {
    const runtime = this.#executions.get(executionId)
    this.#executions.delete(executionId)
    if (!runtime) throw new Error("Issue action resume is unavailable")
    return runtime
  }
}

export const createApprovedIssueActionWorkflow = (
  registry: ApprovedIssueActionExecutionRegistry
) => {
  const awaitApproval = createStep({
    id: approvedIssueActionStepIds.awaitApproval,
    inputSchema,
    outputSchema: resumeSchema,
    resumeSchema,
    suspendSchema: suspendedSchema,
    execute: async ({ inputData, resumeData, suspend }) => {
      if (!resumeData) {
        return suspend(
          { actionId: inputData.actionId },
          { resumeLabel: "approval" }
        )
      }
      if (resumeData.actionId !== inputData.actionId) {
        throw new Error("Issue action resume is unavailable")
      }
      return resumeData
    },
  })

  const executeApprovedIssueAction = createStep({
    id: approvedIssueActionStepIds.execute,
    description:
      "Consume a one-time runtime capability, execute the approved API action, and settle its continuation run.",
    inputSchema: resumeSchema,
    outputSchema,
    execute: async ({ inputData }) => {
      const runtime = registry.take(inputData.executionId)
      requireActiveResumeRequest(runtime.signal)
      if (!runtime.features.runs || !runtime.features.writes) {
        throw new Error("Issue action resume is unavailable")
      }

      let run
      try {
        run = await runtime.api.resumeApprovedAction({
          actionId: inputData.actionId,
          resumeTicket: runtime.resumeTicket,
        })
      } catch (cause) {
        reportRuntimeFailure(runtime, cause)
        throw workflowUnavailable()
      }
      if (!isActiveOpaqueGrant(run.grant, run.expiresAt)) {
        throw new Error("Issue action resume is unavailable")
      }

      const settlement = createRunSettlement(
        runtime.api,
        run.grant,
        (cause) => {
          reportRuntimeFailure(runtime, cause)
          runtime.captureSettlementFailure?.()
        }
      )
      try {
        requireActiveResumeRequest(runtime.signal)
        const receipt = toSafeActionReceipt(
          await runtime.api.executeApprovedAction({
            actionId: inputData.actionId,
            grant: run.grant,
          }),
          { actionId: inputData.actionId }
        )
        const validatedReceipt = canonicalOutputValidator(receipt)
        if (!validatedReceipt.success) throw validatedReceipt.error
        await settlement.complete()
        return validatedReceipt.value
      } catch (cause) {
        reportRuntimeFailure(runtime, cause)
        try {
          await settlement.fail()
        } catch (settlementCause) {
          reportRuntimeFailure(runtime, settlementCause)
        }
        throw workflowUnavailable()
      }
    },
  })

  return createWorkflow({
    id: "approved-issue-action",
    description:
      "Persist an approval suspension before executing an API-approved Issue action.",
    inputSchema,
    outputSchema,
  })
    .then(awaitApproval)
    .then(executeApprovedIssueAction)
    .commit()
}

export type ApprovedIssueActionWorkflow = ReturnType<
  typeof createApprovedIssueActionWorkflow
>

export const createApprovedIssueActionResumeRuntime = async (
  storage: MastraCompositeStore & { close(): Promise<void> }
) => {
  await storage.init()
  const executionRegistry = new ApprovedIssueActionExecutionRegistry()
  const approvedIssueActionWorkflow =
    createApprovedIssueActionWorkflow(executionRegistry)
  return {
    executionRegistry,
    mastra: new Mastra({
      logger: false,
      storage,
      workflows: { approvedIssueActionWorkflow },
    }),
    storage,
  }
}

export const suspendApprovedIssueAction = async (
  mastra: Mastra,
  actionId: string
): Promise<void> => {
  const workflow = mastra.getWorkflow("approvedIssueActionWorkflow")
  const existing = await workflow.getWorkflowRunById(actionId)
  if (existing) {
    const suspended = createWorkflowStateReader(existing).getSuspendedStep()
    if (
      existing.status !== "suspended" ||
      suspended?.stepId !== approvedIssueActionStepIds.awaitApproval
    ) {
      throw new Error("Issue action approval is unavailable")
    }
    return
  }
  const run = await workflow.createRun({ runId: actionId })
  const result = await run.start({
    inputData: { actionId },
    tracingOptions: { hideInput: true, hideOutput: true },
  })
  if (result.status !== "suspended") {
    throw new Error("Issue action approval is unavailable")
  }
}
