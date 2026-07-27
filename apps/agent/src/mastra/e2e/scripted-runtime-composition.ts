import {
  createProductAgent,
  createProductAgentMemory,
} from "../agents/product-agent"
import { createPublicWebResearchAgent } from "../agents/public-web-research-agent"
import { createThreadTitleAgent } from "../agents/thread-title-agent"
import { createProductRuntime } from "../composition/create-runtime"
import { ProductAgentExecutionRegistry } from "../runtime/request-context"
import { createAgentStorage } from "../storage"
import type { AgentStorageEnvironment } from "../storage"
import { createScriptedModel } from "../test-support/scripted-model"
import { createWebSearchTool } from "../tools/web-search/tool"
import {
  ApprovedIssueActionExecutionRegistry,
  createApprovedIssueActionWorkflow,
} from "../workflows/approved-issue-action"

export const createScriptedAgentRuntimeComposition = (
  environment: AgentStorageEnvironment
) => {
  const storage = createAgentStorage(environment, "scripted-runtime")
  const executionRegistry = new ProductAgentExecutionRegistry()
  const publicWebResearchAgent = createPublicWebResearchAgent({
    model: createScriptedModel(
      [{ parts: [{ type: "text", text: "No public search was scripted." }] }],
      { modelId: "scripted-public-research", repeat: true }
    ),
    tools: {},
  })
  const productAgent = createProductAgent({
    memory: createProductAgentMemory(storage),
    model: createScriptedModel(
      [
        {
          finishReason: "tool-calls",
          parts: [
            {
              type: "tool-call",
              input: {
                description:
                  "Created by the deterministic cross-Worker Agent E2E.",
                priority: "high",
                title: "Scripted Agent cross-worker issue",
              },
              toolCallId: "scripted-create-issue-call",
              toolName: "create_issue",
            },
          ],
          usage: { inputTokens: 12, outputTokens: 3 },
        },
        {
          parts: [
            {
              type: "text",
              text: "SCRIPTED_AGENT_OK",
            },
          ],
          usage: { inputTokens: 16, outputTokens: 4 },
        },
      ],
      { modelId: "scripted-product-agent", repeat: true }
    ),
    resolveExecution: executionRegistry.resolve,
    webSearchTool: createWebSearchTool(
      publicWebResearchAgent,
      executionRegistry.resolve
    ),
  })
  const threadTitleAgent = createThreadTitleAgent(
    createScriptedModel(
      [{ parts: [{ type: "text", text: "Scripted Agent conversation" }] }],
      { modelId: "scripted-thread-title", repeat: true }
    )
  )
  const approvedIssueActionExecutionRegistry =
    new ApprovedIssueActionExecutionRegistry()
  const approvedIssueActionWorkflow = createApprovedIssueActionWorkflow(
    approvedIssueActionExecutionRegistry
  )
  return {
    approvedIssueActionExecutionRegistry,
    approvedIssueActionWorkflow,
    executionRegistry,
    mastra: createProductRuntime({
      approvedIssueActionWorkflow,
      productAgent,
      publicWebResearchAgent,
      storage,
      threadTitleAgent,
    }),
    publicWebResearchAgent,
    storage,
    threadTitleAgent,
  }
}
