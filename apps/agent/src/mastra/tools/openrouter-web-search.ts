import { createAgentOpenRouter } from "../models/openrouter"

/**
 * OpenRouterのprovider-executed server toolは公開Web検索専用Agentだけへ渡す。
 * product-agentへ直接登録すると、local query guardとquota境界を迂回できる。
 */
export const createOpenRouterWebSearchTool = (apiKey?: string) =>
  createAgentOpenRouter(apiKey).tools.webSearch({
    engine: "auto",
    maxResults: 5,
  })
