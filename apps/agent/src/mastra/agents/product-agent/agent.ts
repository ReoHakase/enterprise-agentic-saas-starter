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
import { productMemoryPersistenceGuard } from "./memory-persistence-guard"
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
  allowUnscopedModel?: boolean
  memory?: MastraMemory
  model: ProductAgentConfig["model"]
  resolveExecution: ProductAgentExecutionResolver
  webSearchTool: ReturnType<typeof createWebSearchTool>
}

export const createProductAgent = ({
  allowUnscopedModel = false,
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
        if (
          allowUnscopedModel &&
          !getOptionalProductAgentRequestState(requestContext)
        ) {
          return resolved
        }
        const execution = resolveExecution(requestContext)
        return withRunLiveness(resolved, async () => {
          try {
            await execution.api.assertRunLive({
              grant: execution.runGrant,
            })
          } catch (cause) {
            execution.onRevoked(cause)
            throw cause
          }
        })
      },
      name: "Product Agent",
      outputProcessors: [productMemoryPersistenceGuard],
      skills: [
        coreSkill,
        issueTriageSkill,
        issueWritingSkill,
        webAssistanceSkill,
      ],
      tools: ({ requestContext }) => {
        const state = getOptionalProductAgentRequestState(requestContext)
        if (allowUnscopedModel && !state) {
          return {}
        }
        return productAgentToolsForFeatures(
          state?.policy,
          resolveExecution,
          webSearchTool
        )
      },
    }
  )
