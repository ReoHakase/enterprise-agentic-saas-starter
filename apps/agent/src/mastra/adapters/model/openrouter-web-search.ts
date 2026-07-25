import { createAgentOpenRouter } from "./openrouter"

const openRouterWebSearchOptions = {
  engine: "exa",
  maxResults: 3,
} as const

/**
 * OpenRouterのprovider-executed server toolは公開Web検索専用Agentだけへ渡す。
 * product-agentへ直接登録すると、local query guardとquota境界を迂回できる。
 */
export const createOpenRouterWebSearchTool = (
  apiKey?: string,
  baseURL?: string
) =>
  createAgentOpenRouter(apiKey, baseURL).tools.webSearch(
    openRouterWebSearchOptions
  )
