import type { RequestContext } from "@mastra/core/request-context"

import type { AgentInternalGateway } from "../internal-api"
import type { RunSettlement } from "../run-settlement"
import type { AgentToolBudget } from "../tool-budget"

export type ProductAgentRuntime = {
  allowedPublicWebSearchQuery: string | null
  api: AgentInternalGateway
  budget: AgentToolBudget
  openRouterApiKey: string
  rootRunId: string
  runGrant: string
  settlement: RunSettlement
  timezone: string
  writesEnabled: boolean
}

export type ProductAgentRequestContext = {
  runtime?: ProductAgentRuntime
}

export const getProductAgentRuntime = (
  requestContext?: RequestContext<ProductAgentRequestContext>
): ProductAgentRuntime => {
  const runtime = requestContext?.get("runtime")
  if (!runtime) throw new Error("Agent runtime capability is unavailable")
  return runtime
}

export const getOptionalProductAgentRuntime = (
  requestContext?: RequestContext<ProductAgentRequestContext>
): ProductAgentRuntime | undefined => requestContext?.get("runtime")
