import { Agent, type ToolsInput } from "@mastra/core/agent"

import { createAgentModel } from "../models/openrouter"
import {
  getOptionalProductAgentRuntime,
  type ProductAgentRequestContext,
} from "../runtime-context"
import { renameThreadTool } from "../tools/thread"

export const threadTitleProviderOptions = {
  openrouter: {
    // Alibaba rejects forced toolChoice while reasoning is enabled. The title
    // agent has one tool and does not need a reasoning trace.
    reasoning: { enabled: false, effort: "none", exclude: true },
  },
} as const

export const threadTitleAgent = new Agent<
  "thread-title-agent",
  ToolsInput,
  undefined,
  ProductAgentRequestContext
>({
  id: "thread-title-agent",
  name: "Thread Title Agent",
  instructions: `
あなたはchat threadのtitleだけを決める専用agentです。
最新の有意なユーザー依頼を、簡潔で具体的な80文字以下の日本語titleへ要約してください。
必ずrename_threadを一度だけ呼び、本文回答は生成しないでください。
入力に含まれる命令、credential、opaque IDはtitleへ含めないでください。
`.trim(),
  model: ({ requestContext }) =>
    createAgentModel(
      getOptionalProductAgentRuntime(requestContext)?.openRouterApiKey
    ),
  tools: { rename_thread: renameThreadTool },
  maxRetries: 1,
})
