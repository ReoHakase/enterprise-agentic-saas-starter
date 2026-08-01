import type { MastraCompositeStore } from "@mastra/core/storage"

import {
  createAgentAuxiliaryModel,
  createAgentModel,
} from "../adapters/model/openrouter"
import { createDirectOpenRouterWebSearch } from "../adapters/model/openrouter-web-search"
import { reportDevelopmentCauseChain } from "../adapters/telemetry/development-error"
import {
  createProductAgent,
  createProductAgentMemory,
} from "../agents/product-agent"
import { ProductAgentExecutionRegistry } from "../runtime/request-context"
import type { AgentStorageEnvironment } from "../storage"
import { createWebSearchTool } from "../tools/web-search/tool"

type ProductAgentCompositionEnvironment = AgentStorageEnvironment & {
  OPENROUTER_API_KEY?: string
  OPENROUTER_BASE_URL?: string
}

type ProductAgentCompositionOptions = {
  allowUnscopedModel?: boolean
}

export const createProductAgentComposition = (
  environment: ProductAgentCompositionEnvironment,
  storage: MastraCompositeStore,
  { allowUnscopedModel = false }: ProductAgentCompositionOptions = {}
) => {
  const unscopedModelEnabled =
    allowUnscopedModel && environment.NODE_ENV === "development"
  const model = () =>
    createAgentModel(
      environment.OPENROUTER_API_KEY,
      environment.OPENROUTER_BASE_URL
    )
  const titleModel = createAgentAuxiliaryModel(
    environment.OPENROUTER_API_KEY,
    environment.OPENROUTER_BASE_URL
  )
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
  const memory = createProductAgentMemory(storage, titleModel)
  const productAgent = createProductAgent({
    allowUnscopedModel: unscopedModelEnabled,
    memory: unscopedModelEnabled ? undefined : memory,
    model,
    resolveExecution: executionRegistry.resolve,
    webSearchTool: productWebSearchTool,
  })
  return {
    executionRegistry,
    memory,
    productAgent,
    productWebSearchTool,
  }
}
