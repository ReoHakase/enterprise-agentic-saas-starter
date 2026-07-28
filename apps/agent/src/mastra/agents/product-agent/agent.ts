import { Agent, type AgentConfig, type ToolsInput } from "@mastra/core/agent"
import type { MastraMemory } from "@mastra/core/memory"

import {
  isLivenessLanguageModel,
  withRunLiveness,
} from "../../runtime/liveness-model"
import {
  getOptionalProductAgentRequestState,
  type ProductAgentExecutionResolver,
  type ProductAgentRequestContext,
} from "../../runtime/request-context"
import type { createWebSearchTool } from "../../tools/web-search/tool"
import { productAgentInstructions } from "./instructions"
import {
  coreSkill,
  issueTriageSkill,
  issueWritingSkill,
  webAssistanceSkill,
} from "./skills"
import { productAgentToolsForFeatures } from "./tools"

type ProductAgentConfig = AgentConfig<
  "product-agent",
  ToolsInput,
  undefined,
  ProductAgentRequestContext
>

export type ProductAgentDependencies = {
  memory: MastraMemory
  model: ProductAgentConfig["model"]
  resolveExecution: ProductAgentExecutionResolver
  webSearchTool: ReturnType<typeof createWebSearchTool>
}

export const createProductAgent = ({
  memory,
  model,
  resolveExecution,
  webSearchTool,
}: ProductAgentDependencies) =>
  new Agent<"product-agent", ToolsInput, undefined, ProductAgentRequestContext>(
    {
      id: "product-agent",
      instructions: productAgentInstructions,
      maxRetries: 0,
      memory,
      model: async ({ mastra, requestContext }) => {
        const resolved =
          typeof model === "function"
            ? await model({ mastra, requestContext })
            : model
        if (!isLivenessLanguageModel(resolved)) {
          throw new Error("Agent model liveness boundary is unavailable")
        }
        const execution = resolveExecution(requestContext)
        return withRunLiveness(resolved, () =>
          execution.api.readActiveOrganization({
            grant: execution.runGrant,
          })
        )
      },
      name: "Product Agent",
      skills: [
        coreSkill,
        issueTriageSkill,
        issueWritingSkill,
        webAssistanceSkill,
      ],
      tools: ({ requestContext }) => {
        const state = getOptionalProductAgentRequestState(requestContext)
        return productAgentToolsForFeatures(
          state?.policy,
          resolveExecution,
          webSearchTool
        )
      },
    }
  )
