import type { MastraCompositeStore } from "@mastra/core/storage"

import { createAgentModel } from "../adapters/model/openrouter"
import { createOpenRouterWebSearchTool } from "../adapters/model/openrouter-web-search"
import {
  createProductAgent,
  createProductAgentMemory,
} from "../agents/product-agent"
import { createPublicWebResearchAgent } from "../agents/public-web-research-agent"
import { createThreadTitleAgent } from "../agents/thread-title-agent"
import { ProductAgentExecutionRegistry } from "../runtime/request-context"
import type { AgentStorageEnvironment } from "../storage"
import { createWebSearchTool } from "../tools/web-search/tool"

type ProductAgentCompositionEnvironment = AgentStorageEnvironment & {
  OPENROUTER_API_KEY?: string
  OPENROUTER_BASE_URL?: string
}

export const createProductAgentComposition = (
  environment: ProductAgentCompositionEnvironment,
  storage: MastraCompositeStore
) => {
  const model = () =>
    createAgentModel(
      environment.OPENROUTER_API_KEY,
      environment.OPENROUTER_BASE_URL
    )
  const publicWebResearchAgent = createPublicWebResearchAgent({
    model,
    tools: {
      openrouter_web_search: createOpenRouterWebSearchTool(
        environment.OPENROUTER_API_KEY,
        environment.OPENROUTER_BASE_URL
      ),
    },
  })
  const threadTitleAgent = createThreadTitleAgent(model)
  const executionRegistry = new ProductAgentExecutionRegistry()
  const productWebSearchTool = createWebSearchTool(
    publicWebResearchAgent,
    executionRegistry.resolve
  )
  const memory = createProductAgentMemory(storage)
  const productAgent = createProductAgent({
    memory,
    model,
    resolveExecution: executionRegistry.resolve,
    webSearchTool: productWebSearchTool,
  })
  return {
    executionRegistry,
    productAgent,
    productWebSearchTool,
    publicWebResearchAgent,
    threadTitleAgent,
  }
}
