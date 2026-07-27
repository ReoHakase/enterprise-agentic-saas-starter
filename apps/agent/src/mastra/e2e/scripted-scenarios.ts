import {
  createProductAgent,
  createProductAgentMemory,
} from "../agents/product-agent"
import { createProductRuntime } from "../composition/create-runtime"
import { ProductAgentExecutionRegistry } from "../runtime/request-context"
import { createScriptedModel } from "../test-support/scripted-model"
import { createWebSearchTool } from "../tools/web-search/tool"
import { createScriptedAgentRuntimeComposition } from "./scripted-runtime-composition"

const scriptedComposition = createScriptedAgentRuntimeComposition({
  MASTRA_STORAGE_URL: ":memory:",
  NODE_ENV: "test",
})
export const {
  approvedIssueActionExecutionRegistry:
    scriptedApprovedIssueActionExecutionRegistry,
  threadTitleAgent: scriptedThreadTitleAgent,
} = scriptedComposition

const { publicWebResearchAgent, storage } = scriptedComposition
export const scriptedSseExecutionRegistry = new ProductAgentExecutionRegistry()
const scriptedSseProductAgent = createProductAgent({
  memory: createProductAgentMemory(storage),
  model: createScriptedModel(
    [{ parts: [{ type: "text", text: "SCRIPTED_NATIVE_SSE_OK" }] }],
    {
      metadataSentinel: "PRIVATE_PROVIDER_METADATA_SENTINEL",
      modelId: "scripted-native-sse-agent",
      repeat: true,
    }
  ),
  resolveExecution: scriptedSseExecutionRegistry.resolve,
  webSearchTool: createWebSearchTool(
    publicWebResearchAgent,
    scriptedSseExecutionRegistry.resolve
  ),
})
export const scriptedSseMastra = createProductRuntime({
  approvedIssueActionWorkflow: scriptedComposition.approvedIssueActionWorkflow,
  productAgent: scriptedSseProductAgent,
  publicWebResearchAgent,
  storage,
  threadTitleAgent: scriptedThreadTitleAgent,
})
