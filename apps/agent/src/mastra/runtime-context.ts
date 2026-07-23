import type { AgentThreadRenameResult } from "@enterprise-agentic-saas/api/agent-client"
import type { RequestContext } from "@mastra/core/request-context"

import type { AgentInternalGateway } from "../control-plane/client"
import type { RunSettlement } from "../runtime/settlement"
import type { AgentToolBudget } from "../tools/budget"
import type { AgentVisionBudget } from "../tools/vision-budget"

export type ProductAgentRuntime = {
  api: AgentInternalGateway
  budget: AgentToolBudget
  openRouterApiKey: string
  onThreadTitle?: (result: AgentThreadRenameResult) => void
  rootRunId: string
  runGrant: string
  settlement: RunSettlement
  timezone: string
  visionBudget: AgentVisionBudget
  visionEnabled: boolean
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
