import type { AgentRuntimeChatInput } from "@enterprise-agentic-saas/agent-contracts"
import type {
  AIV5Type,
  MessageListInput,
} from "@mastra/core/agent/message-list"
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
import { createAgentClientTools } from "../tools/client/tool"
import { waitForAbortable } from "./chat-lifecycle"
import type { AgentControlPlanePort } from "./ports"
import { productGenerationWebSearchOptions } from "./product-generation"
import type { ProductAgentRequestContext } from "./request-context"

export class AgentImageInputError extends Error {}

type RuntimeProductAgent = Awaited<
  ReturnType<ReturnType<typeof createProductRuntime>["getAgentById"]>
>

export const startProductOutput = async ({
  abortSignal,
  api,
  budget,
  input,
  memoryResourceId,
  modelMessages,
  productAgent,
  requestContext,
  runGrant,
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
  modelMessages: MessageListInput
  productAgent: RuntimeProductAgent
  requestContext: RequestContext<ProductAgentRequestContext>
  runGrant: string
  toolAllowlist: readonly string[] | undefined
  transientContext: AIV5Type.ModelMessage[]
  onAbort(): void
  onError(event: unknown): void
  onFinish(): void
}) => {
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
    Promise.resolve(
      productAgent.stream(modelMessages, {
        abortSignal,
        clientTools: filterAgentTools(
          createAgentClientTools(budget),
          toolAllowlist
        ),
        maxSteps: 8,
        context: transientContext,
        memory: {
          options: { readOnly: true },
          resource: memoryResourceId,
          thread: input.threadId,
        },
        modelSettings: {
          maxOutputTokens: AGENT_MODEL_PROFILE.reservedOutputTokens,
          temperature: 0.2,
        },
        ...productGenerationWebSearchOptions([input.message], toolAllowlist),
        onAbort,
        onError,
        onFinish,
        requestContext,
        tracingOptions: {
          hideInput: true,
          hideOutput: true,
        },
        stopWhen: stopOnPendingIssueAction,
        // Keep tool reservations and writes serial for deterministic ordering.
        toolCallConcurrency: 1,
      })
    ),
    abortSignal
  )
}
