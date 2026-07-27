import { Agent, type AgentConfig, type ToolsInput } from "@mastra/core/agent"

import type { ProductAgentRequestContext } from "../../runtime/request-context"
import { threadTitleInstructions } from "./instructions"

type ThreadTitleAgentConfig = AgentConfig<
  "thread-title-agent",
  ToolsInput,
  undefined,
  ProductAgentRequestContext
>

export const createThreadTitleAgent = (
  model: ThreadTitleAgentConfig["model"]
) =>
  new Agent<
    "thread-title-agent",
    ToolsInput,
    undefined,
    ProductAgentRequestContext
  >({
    id: "thread-title-agent",
    name: "Thread Title Agent",
    instructions: threadTitleInstructions,
    maxRetries: 0,
    model,
    tools: {},
  })
