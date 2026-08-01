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
type ActionInput = v.InferOutput<typeof actionInputSchema>
type ActionResume = v.InferOutput<typeof actionResumeSchema>
const valibotValidator =
  <TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    schema: TSchema
  ) =>
  (
    value: unknown
  ):
    | { success: true; value: v.InferOutput<TSchema> }
    | { success: false; error: Error } => {
    const parsed = v.safeParse(schema, value)
    return parsed.success
      ? { success: true, value: parsed.output }
      : { success: false, error: new Error("Workflow input is invalid") }
  }
const identifierJsonSchema = {
  type: "string",
  pattern: "^[A-Za-z0-9_-]{1,128}$",
} as const
const inputSchema = jsonSchema<ActionInput>(
  {
    type: "object",
    additionalProperties: false,
    required: ["actionId"],
    properties: { actionId: identifierJsonSchema },
  },
  { validate: valibotValidator(actionInputSchema) }
)
const suspendedSchema = inputSchema
const resumeSchema = jsonSchema<ActionResume>(
  {
    type: "object",
    additionalProperties: false,
    required: ["actionId", "executionId"],
    properties: {
      actionId: identifierJsonSchema,
      executionId: identifierJsonSchema,
    },
  },
  { validate: valibotValidator(actionResumeSchema) }
)
const outputSchema = jsonSchema<AgentActionExecutionResult>(
  {
    type: "object",
    additionalProperties: false,
    required: ["actionId", "kind", "status", "issue"],
    properties: {
      actionId: identifierJsonSchema,
      kind: {
        type: "string",
        enum: ["create_issue", "update_issue", "delete_issue"],
      },
      status: { type: "string", const: "succeeded" },
      issue: {
        type: "object",
        additionalProperties: false,
        required: ["id", "number", "revision", "deleted"],
        properties: {
          id: identifierJsonSchema,
          number: { type: "integer", minimum: 1 },
          revision: { type: "integer", minimum: 1 },
          deleted: { type: "boolean" },
        },
      },
    },
  },
  { validate: valibotValidator(agentActionExecutionResultSchema) }
)

export type ApprovedIssueActionRuntime = {
  api: Pick<
    AgentControlPlanePort,
    "executeApprovedAction" | "cancelRun" | "finishRun" | "resumeApprovedAction"
  >
  captureSettlementFailure?: () => void
  features: AgentFeatureSwitches
  reportFailure?: (cause: unknown) => void
  resumeTicket: string
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
        const receipt = toSafeActionReceipt(
          await runtime.api.executeApprovedAction({
            actionId: inputData.actionId,
            grant: run.grant,
          }),
          { actionId: inputData.actionId }
        )
        await settlement.complete()
        return receipt
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

export const createApprovedIssueActionResumeRuntime = (
  storage: MastraCompositeStore
) => {
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
