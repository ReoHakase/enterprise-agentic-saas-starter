import type { MastraCompositeStore } from "@mastra/core/storage"

import { createAgentModel } from "../adapters/model/openrouter"
import { createDirectOpenRouterWebSearch } from "../adapters/model/openrouter-web-search"
import { reportDevelopmentCauseChain } from "../adapters/telemetry/development-error"
import {
  createProductAgent,
  createProductAgentMemory,
} from "../agents/product-agent"
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
  const threadTitleAgent = createThreadTitleAgent(model)
  const executionRegistry = new ProductAgentExecutionRegistry()
  const productWebSearchTool = createWebSearchTool(
    createDirectOpenRouterWebSearch(
      environment.OPENROUTER_API_KEY,
      environment.OPENROUTER_BASE_URL
    ),
    executionRegistry.resolve,
    {
      onProviderError: (cause) =>
        reportDevelopmentCauseChain(environment, "web-search-provider", cause),
    }
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
    memory,
    productAgent,
    productWebSearchTool,
    threadTitleAgent,
  }
}
