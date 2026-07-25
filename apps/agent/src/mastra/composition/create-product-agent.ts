import type { RequestContext } from "@mastra/core/request-context"

import { createAgentModel } from "../adapters/model/openrouter"
import { createOpenRouterWebSearchTool } from "../adapters/model/openrouter-web-search"
import { createProductAgent } from "../agents/product-agent"
import {
  createPublicWebResearchAgent,
  type PublicWebResearchRequestContext,
} from "../agents/public-web-research-agent"
import { createThreadTitleAgent } from "../agents/thread-title-agent"
import {
  getOptionalProductAgentRuntime,
  type ProductAgentRequestContext,
} from "../runtime/request-context"
import { createWebSearchTool } from "../tools/web-search/tool"

const readPublicWebApiKey = (
  requestContext?: RequestContext<PublicWebResearchRequestContext>
) => requestContext?.get("apiKey")

const readPublicWebBaseURL = (
  requestContext?: RequestContext<PublicWebResearchRequestContext>
) => requestContext?.get("baseURL")

export const publicWebResearchAgent = createPublicWebResearchAgent({
  model: ({ requestContext }) =>
    createAgentModel(
      readPublicWebApiKey(requestContext),
      readPublicWebBaseURL(requestContext)
    ),
  tools: ({ requestContext }) => ({
    openrouter_web_search: createOpenRouterWebSearchTool(
      readPublicWebApiKey(requestContext),
      readPublicWebBaseURL(requestContext)
    ),
  }),
})

export const productWebSearchTool = createWebSearchTool(publicWebResearchAgent)

const productModel = ({
  requestContext,
}: {
  requestContext?: RequestContext<ProductAgentRequestContext>
}) =>
  createAgentModel(
    getOptionalProductAgentRuntime(requestContext)?.openRouterApiKey,
    getOptionalProductAgentRuntime(requestContext)?.openRouterBaseURL
  )

export const productAgent = createProductAgent({
  model: productModel,
  webSearchTool: productWebSearchTool,
})

export const threadTitleAgent = createThreadTitleAgent({
  model: productModel,
})
