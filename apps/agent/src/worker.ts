import type { AgentActionExecutionResult } from "@enterprise-agentic-saas/api/agent-client"
import { toAISdkStream } from "@mastra/ai-sdk"
import { RequestContext } from "@mastra/core/request-context"
import * as Sentry from "@sentry/cloudflare"
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai"
import { WorkerEntrypoint } from "cloudflare:workers"

import {
  sanitizeAssistantMessage,
  toModelUiMessages,
} from "./canonical-messages"
import {
  appendCurrentMessageImages,
  loadCurrentMessageImages,
} from "./chat-input"
import { createAgentClientTools } from "./client-tools"
import { isActiveOpaqueGrant, toLiveConnectionGrant } from "./connection-grant"
import type { AgentRuntimeEnv } from "./environment"
import { readAgentFeatureSwitches } from "./feature-flags"
import {
  createAgentInternalGateway,
  toAgentControlFailure,
} from "./internal-api"
export { IssueAssistant } from "./legacy-issue-assistant"
import { mastra } from "./mastra"
import { extractExplicitPublicWebSearchQuery } from "./mastra/public-web-query"
import type { ProductAgentRequestContext } from "./mastra/runtime-context"
import { createAgentSentryOptions } from "./observability"
import { resumeIssueAction } from "./resume-issue-action"
import { createRunSettlement } from "./run-settlement"
import {
  parseAgentRuntimeChatInput,
  parseAgentRuntimeResumeInput,
  readBoundedPrivateJson,
} from "./runtime-request"
import { captureAgentFailure } from "./sentry"
import { stopOnPendingIssueAction } from "./stop-conditions"
import { createAgentToolBudget } from "./tool-budget"

const RUN_TIMEOUT_MS = 5 * 60 * 1000

type AgentExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
}

const fixedResponse = (
  status: number,
  body: string,
  extraHeaders: Record<string, string> = {}
): Response =>
  new Response(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "text/plain; charset=utf-8",
      ...extraHeaders,
    },
  })

const invalidRequest = (): Response =>
  fixedResponse(400, "Invalid agent request")
const unavailable = (): Response => fixedResponse(503, "Agent unavailable")
const controlFailure = (error: unknown): Response | null => {
  const failure = toAgentControlFailure(error)
  if (!failure) return null
  return fixedResponse(
    failure.status,
    failure.body,
    failure.retryAfter === null
      ? {}
      : { "retry-after": String(failure.retryAfter) }
  )
}

const consumeStream = async (stream: ReadableStream<string>): Promise<void> => {
  await stream.pipeTo(new WritableStream()).catch(() => undefined)
}

const handleChat = async (
  request: Request,
  environment: AgentRuntimeEnv,
  context: AgentExecutionContext
): Promise<Response> => {
  const features = readAgentFeatureSwitches(environment)
  if (!features.runs) return unavailable()
  if (!environment.OPENROUTER_API_KEY) return unavailable()

  let rawInput: unknown
  try {
    rawInput = await readBoundedPrivateJson(request)
  } catch {
    return invalidRequest()
  }
  const input = parseAgentRuntimeChatInput(rawInput)
  if (!input) return invalidRequest()
  if (input.assetIds.length > 0 && !features.vision) return unavailable()
  const api = createAgentInternalGateway(environment.AGENT_INTERNAL_API)

  let connectionGrant: string
  try {
    const connection = await api.consumeConnectionTicket({
      ticket: input.ticket,
      threadId: input.threadId,
    })
    const liveGrant = toLiveConnectionGrant(connection, input.threadId)
    if (!liveGrant) return unavailable()
    connectionGrant = liveGrant.grant
  } catch {
    return unavailable()
  }

  let run
  try {
    run = await api.startRun({
      assetIds: input.assetIds,
      clientMessageId: input.clientMessageId,
      grant: connectionGrant,
      trigger: input.trigger,
    })
    if (!isActiveOpaqueGrant(run.grant, run.expiresAt)) {
      captureAgentFailure("run_grant_invalid")
      return unavailable()
    }
  } catch (error) {
    const response = controlFailure(error)
    if (response) return response
    captureAgentFailure("run_start_failed")
    return unavailable()
  }

  const settlement = createRunSettlement(api, run.grant)
  const budget = createAgentToolBudget()
  const requestContext = new RequestContext<ProductAgentRequestContext>()
  const currentUserText =
    input.trigger === "user_message" && input.messages.at(-1)?.role === "user"
      ? input.messages.at(-1)?.parts.find((part) => part.type === "text")?.text
      : undefined
  requestContext.set("runtime", {
    allowedPublicWebSearchQuery:
      extractExplicitPublicWebSearchQuery(currentUserText),
    api,
    budget,
    openRouterApiKey: environment.OPENROUTER_API_KEY,
    rootRunId: run.rootRunId,
    runGrant: run.grant,
    settlement,
    timezone: input.timezone,
    writesEnabled: features.writes,
  })

  try {
    let modelMessages = await convertToModelMessages(
      toModelUiMessages(input.messages)
    )
    if (input.assetIds.length > 0) {
      try {
        const images = await loadCurrentMessageImages(
          api,
          run.grant,
          input.assetIds
        )
        modelMessages = appendCurrentMessageImages(
          modelMessages,
          input.assetIds,
          images
        )
      } catch {
        captureAgentFailure("image_failed")
        await settlement.fail()
        return fixedResponse(502, "Image input failed")
      }
    }

    let modelFailed = false
    const timeoutSignal = AbortSignal.timeout(RUN_TIMEOUT_MS)
    const abortSignal = request.signal
      ? AbortSignal.any([request.signal, timeoutSignal])
      : timeoutSignal
    const productAgent = mastra.getAgentById("product-agent")
    const output = await productAgent.stream(modelMessages, {
      abortSignal,
      clientTools: createAgentClientTools(budget),
      maxSteps: 8,
      modelSettings: { maxOutputTokens: 768, temperature: 0.2 },
      onAbort: async () => {
        await settlement.cancel()
      },
      onError: async () => {
        modelFailed = true
        captureAgentFailure("model_failed")
        await settlement.fail()
      },
      requestContext,
      stopWhen: stopOnPendingIssueAction,
      // Web search reservation must commit before a following Issue write checks
      // the root-run ask_each fence. Serial tool execution closes same-step races.
      toolCallConcurrency: 1,
    })
    const modelStream = toAISdkStream(output, {
      from: "agent",
      onError: () => "Model response failed.",
      sendReasoning: false,
      sendSources: true,
      version: "v6",
    })
    const stream = createUIMessageStream({
      execute: ({ writer }) => writer.merge(modelStream),
      generateId: () => crypto.randomUUID(),
      onError: () => "Model response failed.",
      onFinish: async ({ isAborted, responseMessage }) => {
        if (isAborted) {
          await settlement.cancel()
          return
        }
        if (modelFailed) {
          await settlement.fail()
          return
        }
        try {
          await api.appendRunMessages({
            grant: run.grant,
            messages: [sanitizeAssistantMessage(responseMessage)],
          })
          await settlement.complete()
        } catch {
          captureAgentFailure("model_failed")
          await settlement.fail()
        }
      },
    })
    return createUIMessageStreamResponse({
      headers: { "cache-control": "private, no-store" },
      stream,
      consumeSseStream: ({ stream: sseStream }) => {
        context.waitUntil(consumeStream(sseStream))
      },
    })
  } catch {
    captureAgentFailure("model_failed")
    await settlement.fail()
    return fixedResponse(502, "Model response failed")
  }
}

const handleResume = async (
  request: Request,
  environment: AgentRuntimeEnv
): Promise<Response> => {
  let rawInput: unknown
  try {
    rawInput = await readBoundedPrivateJson(request)
  } catch {
    return invalidRequest()
  }
  const input = parseAgentRuntimeResumeInput(rawInput)
  if (!input) return invalidRequest()
  const api = createAgentInternalGateway(environment.AGENT_INTERNAL_API)

  let result: AgentActionExecutionResult
  try {
    result = await resumeIssueAction(input, {
      api,
      features: readAgentFeatureSwitches(environment),
    })
  } catch {
    captureAgentFailure("resume_failed")
    return unavailable()
  }
  return Response.json(result, {
    headers: { "cache-control": "private, no-store" },
  })
}

export const handleAgentRuntimeRequest = (
  request: Request,
  environment: AgentRuntimeEnv,
  context: AgentExecutionContext
): Promise<Response> | Response => {
  const url = new URL(request.url)
  if (url.search !== "") return invalidRequest()
  if (request.method === "POST" && url.pathname === "/chat") {
    return handleChat(request, environment, context)
  }
  if (request.method === "POST" && url.pathname === "/actions/resume") {
    return handleResume(request, environment)
  }
  return fixedResponse(404, "Not found")
}

class AgentRuntimeBase extends WorkerEntrypoint<AgentRuntimeEnv> {
  fetch(request: Request): Promise<Response> | Response {
    return handleAgentRuntimeRequest(request, this.env, this.ctx)
  }
}

export const AgentRuntime = Sentry.withSentry(
  createAgentSentryOptions,
  AgentRuntimeBase
)

const worker = {
  fetch: () => fixedResponse(404, "Not found"),
} satisfies ExportedHandler<AgentRuntimeEnv>

export default Sentry.withSentry<AgentRuntimeEnv>(
  createAgentSentryOptions,
  worker
)
