import { createProductAgent } from "../agents/product-agent"
import { createPublicWebResearchAgent } from "../agents/public-web-research-agent"
import { createThreadTitleAgent } from "../agents/thread-title-agent"
import { createProductRuntime } from "../composition/create-runtime"
import { createScriptedModel } from "../test-support/scripted-model"
import { createWebSearchTool } from "../tools/web-search/tool"

const publicWebResearchAgent = createPublicWebResearchAgent({
  model: createScriptedModel(
    [{ parts: [{ type: "text", text: "No public search was scripted." }] }],
    { modelId: "scripted-public-research", repeat: true }
  ),
  tools: {},
})

const productAgent = createProductAgent({
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
  webSearchTool: createWebSearchTool(publicWebResearchAgent),
})

const threadTitleAgent = createThreadTitleAgent({
  model: createScriptedModel(
    [
      {
        finishReason: "tool-calls",
        parts: [
          {
            type: "tool-call",
            input: { title: "Scripted agent conversation" },
            toolCallId: "scripted-title-call",
            toolName: "rename_thread",
          },
        ],
        usage: { inputTokens: 8, outputTokens: 4 },
      },
    ],
    { modelId: "scripted-thread-title", repeat: true }
  ),
})

export const scriptedMastra = createProductRuntime({
  productAgent,
  publicWebResearchAgent,
  threadTitleAgent,
})
