import type { AgentThreadRenameResult } from "@enterprise-agentic-saas/agent-contracts"
import type { RequestContext } from "@mastra/core/request-context"

import type { AgentToolBudget } from "../core/budget/tool"
import type { AgentVisionBudget } from "../core/budget/vision"
import type { AgentControlPlanePort } from "./ports"
import type { RunSettlement } from "./settlement"

export type ProductAgentRuntime = {
  api: AgentControlPlanePort
  budget: AgentToolBudget
  openRouterApiKey: string
  openRouterBaseURL?: string
  onThreadTitle?: (result: AgentThreadRenameResult) => void
  rootRunId: string
  runGrant: string
  settlement: RunSettlement
  timezone: string
  toolAllowlist?: readonly string[]
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
