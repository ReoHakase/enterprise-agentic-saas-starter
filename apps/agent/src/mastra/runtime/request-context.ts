import type { RequestContext } from "@mastra/core/request-context"

import type { AgentToolBudget } from "../core/budget/tool"
import type { AgentVisionBudget } from "../core/budget/vision"
import type { AgentControlPlanePort } from "./ports"
import type { RunSettlement } from "./settlement"

export type ProductAgentPolicy = {
  currentMessageHasAssets: boolean
  reusableThreadAssetsAvailable: boolean
  timezone: string
  toolAllowlist?: readonly string[]
  visionEnabled: boolean
  writesEnabled: boolean
}

export type ProductAgentRequestState = {
  executionId: string
  modelRoute: "product"
  policy: ProductAgentPolicy
  resourceId: string
  threadId: string
}

export type ProductAgentRequestContext = {
  runtime?: ProductAgentRequestState
}

export type ProductAgentExecution = {
  api: AgentControlPlanePort
  budget: AgentToolBudget
  onRevoked: (cause: unknown) => void
  rootRunId: string
  runGrant: string
  settlement: RunSettlement
  suspendAction: (actionId: string) => Promise<void>
  visionBudget: AgentVisionBudget
}

export type ProductAgentExecutionResolver = (
  requestContext?: RequestContext<ProductAgentRequestContext>
) => ProductAgentExecution

const getProductAgentRequestState = (
  requestContext?: RequestContext<ProductAgentRequestContext>
): ProductAgentRequestState => {
  const runtime = requestContext?.get("runtime")
  if (!runtime) throw new Error("Agent runtime capability is unavailable")
  return runtime
}

export const getOptionalProductAgentRequestState = (
  requestContext?: RequestContext<ProductAgentRequestContext>
): ProductAgentRequestState | undefined => requestContext?.get("runtime")

export class ProductAgentExecutionRegistry {
  readonly #executions = new Map<string, ProductAgentExecution>()

  register(execution: ProductAgentExecution): {
    executionId: string
    release: () => void
  } {
    const executionId = `execution_${crypto.randomUUID()}`
    this.#executions.set(executionId, execution)
    return {
      executionId,
      release: () => {
        this.#executions.delete(executionId)
      },
    }
  }

  resolve: ProductAgentExecutionResolver = (requestContext) => {
    const { executionId } = getProductAgentRequestState(requestContext)
    const execution = this.#executions.get(executionId)
    if (!execution) throw new Error("Agent runtime capability is unavailable")
    return execution
  }
}
