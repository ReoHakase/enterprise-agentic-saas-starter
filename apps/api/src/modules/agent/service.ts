import {
  AGENT_THREAD_LIST_MAX_COUNT,
  agentActionExecutionResultSchema,
  agentMessagePageSchema,
  type AgentActionExecutionResult,
  type AgentRuntimeChatInput,
  type AgentRuntimeResumeInput,
} from "@enterprise-agentic-saas/agent-contracts"
import * as v from "valibot"

import { HttpError } from "../../errors/http-error"
import {
  createObservedLogger,
  injectObservedRequestHeaders,
  withObservedSpan,
} from "../../platform/observability/runtime"
import { agentMemoryThreadListModel } from "./model"
import type { AgentServicePorts } from "./ports"
import {
  type AgentRuntimeSpanCompletion,
  observeAgentRuntimeStream,
} from "./runtime-stream"

const DEFAULT_THREAD_TITLE = "New conversation"
const AGENT_ACTION_RESUME_TIMEOUT_MS = 50_000
const logger = createObservedLogger("agent").child("runtime")
const messageLogger = createObservedLogger("agent").child("messages")
const permissionLogger = createObservedLogger("agent").child("permission")
const threadLogger = createObservedLogger("agent").child("threads")

const agentRuntimeHeaders = (requestId?: string): Headers => {
  const headers = new Headers({ "content-type": "application/json" })
  if (requestId) headers.set("x-request-id", requestId)
  injectObservedRequestHeaders(headers)
  return headers
}

const boundedRetryAfter = (value: string | null): number => {
  if (value && /^[1-9][0-9]{0,4}$/.test(value)) {
    const seconds = Number(value)
    if (seconds <= 86_400) return seconds
  }
  return 1
}

const normalizeAgentTimezone = (value: string): string => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone
  } catch (cause) {
    throw new HttpError({ code: "validation_error", cause })
  }
}

type AgentSessionIdentity = { sessionId: string; userId: string }
type AgentApprovalPolicyInput = AgentSessionIdentity & { threadId: string }

const getAgentApprovalPolicyForSession = async (
  ports: AgentServicePorts,
  input: AgentApprovalPolicyInput
) => {
  const policy = await ports.getAgentApprovalPolicyForSession(input)
  permissionLogger.info("Agent thread permission resolved", {
    "app.operation": "getAgentThreadPermission",
    "app.outcome": "success",
    "agent.permission.mode": policy.mode,
    "agent.permission.allowed_action_count": Object.values(
      policy.permissions
    ).filter(Boolean).length,
  })
  return policy
}

const listAgentThreadsWithMemory = async (
  ports: AgentServicePorts,
  input: AgentSessionIdentity
) => {
  const registryThreads = await ports.listAgentThreadsForSession(input)
  const first = registryThreads[0]
  if (!first) {
    threadLogger.info("Agent thread list resolved", {
      "app.operation": "listAgentThreads",
      "app.outcome": "success",
      "agent.thread.registry_count": 0,
      "agent.thread.memory_count": 0,
      "agent.thread.memory_match_count": 0,
      "agent.thread.result_count": 0,
    })
    return []
  }
  if (registryThreads.length > AGENT_THREAD_LIST_MAX_COUNT) {
    throw new HttpError({
      code: "service_unavailable",
      cause: new Error("Agent thread list unavailable"),
      retryAfter: 30,
    })
  }
  const capability = await ports.issueAgentConnectionTicket({
    ...input,
    threadId: first.id,
  })
  let response: Response
  try {
    response = await ports.fetchAgentRuntime(
      new Request("https://agent.internal/memory/threads", {
        method: "POST",
        headers: agentRuntimeHeaders(),
        body: JSON.stringify({
          registryThreadIds: registryThreads.map((thread) => thread.id),
          threadId: first.id,
          ticket: capability.ticket,
        }),
      })
    )
  } catch (cause) {
    throw new HttpError({
      code: "service_unavailable",
      cause: cause,
      retryAfter: 30,
    })
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined)
    throw new HttpError({
      code: "service_unavailable",
      cause: new Error("Agent thread list unavailable"),
      retryAfter: 30,
    })
  }
  let memoryThreads: v.InferOutput<typeof agentMemoryThreadListModel>
  try {
    memoryThreads = v.parse(agentMemoryThreadListModel, await response.json())
  } catch (cause) {
    throw new HttpError({
      code: "service_unavailable",
      cause: cause,
      retryAfter: 30,
    })
  }
  const byId = new Map(memoryThreads.map((thread) => [thread.id, thread]))
  const memoryMatchCount = registryThreads.filter((thread) =>
    byId.has(thread.id)
  ).length
  const threads = registryThreads
    .map((thread) => {
      const memoryThread = byId.get(thread.id)
      return memoryThread
        ? Object.assign({}, thread, {
            title: memoryThread.title,
            updatedAt: memoryThread.updatedAt,
          })
        : thread
    })
    .toSorted(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.id.localeCompare(left.id)
    )
  threadLogger.info("Agent thread list resolved", {
    "app.operation": "listAgentThreads",
    "app.outcome": "success",
    "agent.thread.registry_count": registryThreads.length,
    "agent.thread.memory_count": memoryThreads.length,
    "agent.thread.memory_match_count": memoryMatchCount,
    "agent.thread.result_count": threads.length,
  })
  return threads
}

const listAgentMessagesFromMemory = async (
  ports: AgentServicePorts,
  input: AgentSessionIdentity & {
    page: number
    perPage: number
    threadId: string
  }
) => {
  const capability = await ports.issueAgentConnectionTicket(input)
  let response: Response
  try {
    response = await ports.fetchAgentRuntime(
      new Request("https://agent.internal/memory/history", {
        method: "POST",
        headers: agentRuntimeHeaders(),
        body: JSON.stringify({
          threadId: input.threadId,
          ticket: capability.ticket,
          page: input.page,
          perPage: input.perPage,
        }),
      })
    )
  } catch (cause) {
    throw new HttpError({
      code: "service_unavailable",
      cause: cause,
      retryAfter: 30,
    })
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined)
    throw new HttpError({
      code: "service_unavailable",
      cause: new Error("Agent history unavailable"),
      retryAfter: 30,
    })
  }
  try {
    const result = v.parse(agentMessagePageSchema, await response.json())
    messageLogger.info("Agent message history loaded", {
      "app.operation": "listAgentThreadMessages",
      "app.outcome": "success",
      "agent.message.result_count": result.messages.length,
      "agent.message.total_count": result.total,
      "agent.message.page": result.page,
      "agent.message.per_page": result.perPage,
      "agent.message.has_more": result.hasMore,
    })
    return result
  } catch (cause) {
    throw new HttpError({
      code: "service_unavailable",
      cause: cause,
      retryAfter: 30,
    })
  }
}

const observeAgentRuntimeChat = (
  input: AgentRuntimeChatInput,
  callback: (completion: AgentRuntimeSpanCompletion) => Promise<Response>
): Promise<Response> =>
  withObservedSpan(
    {
      attributes: {
        "agent.chat.asset_count": input.assetIds.length,
        "agent.chat.context_reference_count": input.contextReferences.length,
        "agent.chat.trigger": input.trigger,
      },
      name: "Call Agent runtime",
      op: "agent.runtime.fetch",
    },
    (lifecycle) => {
      const completion = Promise.withResolvers<void>()
      lifecycle.endWhen(completion.promise)
      void completion.promise.catch(() => undefined)
      logger.debug("Agent runtime request started", {
        "agent.chat.asset_count": input.assetIds.length,
        "agent.chat.context_reference_count": input.contextReferences.length,
        "agent.chat.reusable_asset_count": input.reusableAssets.length,
        "agent.chat.trigger": input.trigger,
        "agent.runtime.route": "/chat",
      })
      return callback(completion).catch((cause) => {
        completion.reject(cause)
        throw cause
      })
    }
  )

export const createAgentService = (ports: AgentServicePorts) => {
  const listAgentThreads = (input: AgentSessionIdentity) =>
    listAgentThreadsWithMemory(ports, input)

  const createAgentThread = (input: {
    sessionId: string
    userId: string
    permissionMode: "ask_always" | "full_access"
  }) =>
    ports.createAgentThreadForSession({
      ...input,
      title: DEFAULT_THREAD_TITLE,
    })

  const cancelAgentRun = (
    input: Parameters<AgentServicePorts["cancelAgentRunForSession"]>[0]
  ) => ports.cancelAgentRunForSession(input)

  const listAgentMessages = (
    input: AgentSessionIdentity & {
      page: number
      perPage: number
      threadId: string
    }
  ) => listAgentMessagesFromMemory(ports, input)

  const forwardAgentChat = async (
    input: AgentRuntimeChatInput,
    signal?: AbortSignal,
    requestId: string = crypto.randomUUID()
  ): Promise<Response> =>
    observeAgentRuntimeChat(input, async (spanCompletion) => {
      let response: Response
      try {
        response = await ports.fetchAgentRuntime(
          new Request("https://agent.internal/chat", {
            method: "POST",
            headers: agentRuntimeHeaders(requestId),
            body: JSON.stringify(input),
            signal,
          })
        )
      } catch (cause) {
        logger.error("Agent runtime request failed", {
          "agent.runtime.route": "/chat",
        })
        throw new HttpError({
          code: "service_unavailable",
          cause: cause,
          retryAfter: 30,
        })
      }

      const contentType = response.headers.get("content-type") ?? "missing"
      logger[
        response.status >= 500
          ? "error"
          : response.status >= 400
            ? "warn"
            : "info"
      ]("Agent runtime response received", {
        "agent.runtime.content_type": contentType,
        "agent.runtime.route": "/chat",
        "http.response.status_code": response.status,
      })

      if (response.status !== 200) {
        const status = response.status
        const retryAfter =
          status === 429
            ? boundedRetryAfter(response.headers.get("retry-after"))
            : status >= 500
              ? 30
              : null
        await response.body?.cancel().catch(() => undefined)
        throw new HttpError({
          code:
            status === 400
              ? "validation_error"
              : status === 409
                ? "conflict"
                : status === 429
                  ? "rate_limited"
                  : "service_unavailable",
          cause:
            status >= 500
              ? new Error(`Agent runtime returned HTTP ${status}`)
              : undefined,
          retryAfter: retryAfter ?? undefined,
        })
      }

      if (
        response.body === null ||
        !contentType.startsWith("text/event-stream")
      ) {
        await response.body?.cancel().catch(() => undefined)
        throw new HttpError({
          code: "service_unavailable",
          cause: new Error("Invalid Agent runtime response"),
          retryAfter: 30,
        })
      }

      const clientBody = observeAgentRuntimeStream(
        spanCompletion,
        response.body,
        requestId
      )

      return new Response(clientBody, {
        status: 200,
        headers: {
          "cache-control": "private, no-store",
          "content-type": "text/event-stream",
          "x-accel-buffering": "no",
          "x-vercel-ai-ui-message-stream": "v1",
        },
      })
    })

  const forwardAgentActionResume = async (
    input: AgentRuntimeResumeInput,
    signal?: AbortSignal
  ): Promise<AgentActionExecutionResult> => {
    let response: Response
    try {
      const timeoutSignal = AbortSignal.timeout(AGENT_ACTION_RESUME_TIMEOUT_MS)
      response = await ports.fetchAgentRuntime(
        new Request("https://agent.internal/actions/resume", {
          method: "POST",
          headers: agentRuntimeHeaders(),
          body: JSON.stringify(input),
          signal: signal
            ? AbortSignal.any([signal, timeoutSignal])
            : timeoutSignal,
        })
      )
    } catch (cause) {
      throw new HttpError({
        code: "service_unavailable",
        cause: cause,
        retryAfter: 30,
      })
    }

    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined)
      throw new HttpError({
        code: "service_unavailable",
        cause: new Error("Agent action resume failed"),
        retryAfter: 30,
      })
    }

    try {
      return v.parse(agentActionExecutionResultSchema, await response.json())
    } catch (cause) {
      throw new HttpError({
        code: "service_unavailable",
        cause: cause,
        retryAfter: 30,
      })
    }
  }

  const resumeAgentAction = async (
    input: {
      actionId: string
      sessionId: string
      userId: string
    },
    signal?: AbortSignal
  ): Promise<AgentActionExecutionResult> => {
    const preparation = await ports.prepareAgentActionResumeForSession(input)
    if (preparation.kind === "receipt") return preparation.result
    return forwardAgentActionResume(
      {
        actionId: input.actionId,
        resumeTicket: preparation.resume.ticket,
      },
      signal
    )
  }

  const getAgentApprovalPolicy = (input: AgentApprovalPolicyInput) =>
    getAgentApprovalPolicyForSession(ports, input)

  return {
    cancelAgentRun,
    archiveAgentThread: ports.archiveAgentThreadForSession,
    createAgentThread,
    decideAgentAction: ports.decideAgentActionForSession,
    forwardAgentChat,
    getAgentAction: ports.getAgentActionForSession,
    getAgentApprovalPolicy,
    getAgentMonthlyUsage: ports.getAgentMonthlyUsageForSession,
    getAgentOrganizationUsage: ports.getAgentOrganizationUsageForSession,
    listAgentMessages,
    listAgentThreads,
    normalizeAgentTimezone,
    prepareAgentChat: ports.prepareAgentChatForSession,
    prepareAgentClientToolContinuation:
      ports.prepareAgentClientToolContinuationForSession,
    putAgentApprovalPolicy: ports.putAgentApprovalPolicyForSession,
    resumeAgentAction,
    revokeAgentContext: ports.revokeCurrentAgentContext,
  }
}

export type AgentService = ReturnType<typeof createAgentService>
