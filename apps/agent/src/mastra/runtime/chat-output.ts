import type { AgentRuntimeChatInput } from "@enterprise-agentic-saas/agent-contracts"
import { handleChatStream } from "@mastra/ai-sdk"
import type { AIV5Type } from "@mastra/core/agent/message-list"
import type { RequestContext } from "@mastra/core/request-context"

import { filterAgentTools } from "../agents/product-agent"
import type { createProductRuntime } from "../composition/create-runtime"
import type { AgentToolBudget } from "../core/budget/tool"
import {
  createCurrentMessageImageContext,
  loadCurrentMessageImages,
} from "../core/messages/chat-input"
import { AGENT_MODEL_PROFILE } from "../core/model-profile"
import { stopOnPendingIssueAction } from "../core/stop-conditions"
import type { normalizeAgentUsage } from "../core/usage/normalize"
import { createAgentClientTools } from "../tools/client/tool"
import { waitForAbortable } from "./chat-lifecycle"
import type { AgentControlPlanePort } from "./ports"
import { productGenerationWebSearchOptions } from "./product-generation"
import type { ProductAgentRequestContext } from "./request-context"

export class AgentImageInputError extends Error {}

type MastraV6Message = Parameters<
  typeof handleChatStream
>[0]["params"]["messages"][number]

const isMastraV6Message = (
  message: AgentRuntimeChatInput["message"]
): message is AgentRuntimeChatInput["message"] & MastraV6Message =>
  message.parts.every(
    (part) =>
      !("state" in part) ||
      part.state !== "output-error" ||
      part.input !== undefined
  )

export const startProductOutput = async ({
  abortSignal,
  api,
  budget,
  input,
  memoryResourceId,
  mastra,
  requestContext,
  runGrant,
  runtimeRunId,
  toolAllowlist,
  transientContext,
  onAbort,
  onError,
  onFinish,
}: {
  abortSignal: AbortSignal
  api: AgentControlPlanePort
  budget: AgentToolBudget
  input: AgentRuntimeChatInput
  memoryResourceId: string
  mastra: ReturnType<typeof createProductRuntime>
  requestContext: RequestContext<ProductAgentRequestContext>
  runGrant: string
  runtimeRunId: string
  toolAllowlist: readonly string[] | undefined
  transientContext: AIV5Type.ModelMessage[]
  onAbort(): void
  onError(event: unknown): void
  onFinish(event: {
    steps: readonly { providerMetadata?: unknown }[]
    totalUsage: Parameters<typeof normalizeAgentUsage>[0]["usage"]
  }): void | Promise<void>
}) => {
  if (!isMastraV6Message(input.message)) {
    throw new Error("Invalid AI SDK message")
  }
  if (input.assetIds.length > 0) {
    try {
      const images = await waitForAbortable(
        loadCurrentMessageImages(api, runGrant, input.assetIds),
        abortSignal
      )
      transientContext.push(
        ...createCurrentMessageImageContext(input.assetIds, images)
      )
    } catch (cause) {
      if (abortSignal.aborted) throw cause
      throw new AgentImageInputError("Image input failed", { cause })
    }
  }
  return waitForAbortable(
    handleChatStream({
      agentId: "product-agent",
      mastra,
      messageMetadata: () => ({ runId: runtimeRunId }),
      onError: () => "Model response failed.",
      params: {
        messages: [input.message],
        abortSignal,
        clientTools: filterAgentTools(
          createAgentClientTools(budget),
          toolAllowlist
        ),
        maxSteps: 8,
        context: transientContext,
        memory: { resource: memoryResourceId, thread: input.threadId },
        modelSettings: {
          maxOutputTokens: AGENT_MODEL_PROFILE.reservedOutputTokens,
        },
        ...productGenerationWebSearchOptions([input.message], toolAllowlist),
        onAbort,
        onError: ({ error }) => onError(error),
        onFinish,
        requestContext,
        tracingOptions: {
          hideInput: true,
          hideOutput: true,
        },
        stopWhen: stopOnPendingIssueAction,
        // Keep tool reservations and writes serial for deterministic ordering.
        toolCallConcurrency: 1,
      },
      sendReasoning: true,
      sendSources: true,
      sendStart: false,
      version: "v6",
    }),
    abortSignal
  )
}
