import type { ToolsInput } from "@mastra/core/agent"

import type {
  ProductAgentExecutionResolver,
  ProductAgentPolicy,
} from "../../runtime/request-context"
import {
  createIssueReadTools,
  createIssueVisionTools,
  createIssueWriteTools,
} from "../../tools/issues"
import type { createWebSearchTool } from "../../tools/web-search/tool"

export const filterAgentTools = (
  tools: ToolsInput,
  allowlist?: readonly string[]
): ToolsInput => {
  if (!allowlist) return tools
  const allowed = new Set(allowlist)
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => allowed.has(name))
  )
}

export const productAgentToolsForFeatures = (
  policy: ProductAgentPolicy | undefined,
  resolveExecution: ProductAgentExecutionResolver,
  webSearchTool?: ReturnType<typeof createWebSearchTool>
) => {
  const tools = {
    ...createIssueReadTools(resolveExecution),
    ...(policy?.visionEnabled ? createIssueVisionTools(resolveExecution) : {}),
    ...(webSearchTool ? { web_search: webSearchTool } : {}),
  }
  return filterAgentTools(
    policy?.writesEnabled
      ? { ...tools, ...createIssueWriteTools(resolveExecution) }
      : tools,
    policy?.toolAllowlist
  )
}
