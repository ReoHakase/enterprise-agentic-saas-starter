import * as v from "valibot"

import type {
  AgentActionExecutionResult,
  AgentRuntimeChatInput,
  AgentRuntimeResumeInput,
} from "../../agent-client"
import { publicErrors } from "../../errors/app-error"
import { agentActionExecutionResultModel } from "./action-schema"
import type { AgentServicePorts, AgentThreadPermissionMode } from "./ports"

const DEFAULT_THREAD_TITLE = "New conversation"

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
  } catch {
    throw publicErrors.validation("Invalid agent timezone")
  }
}

export const createAgentService = (ports: AgentServicePorts) => {
  const listAgentThreads = (input: { sessionId: string; userId: string }) =>
    ports.listAgentThreadsForSession(input)

  const createAgentThread = (input: {
    sessionId: string
    userId: string
    title?: string
    permissionMode: "ask_always" | "full_access"
  }) =>
    ports.createAgentThreadForSession({
      ...input,
      title: input.title?.trim() || DEFAULT_THREAD_TITLE,
    })

  const archiveAgentThread = (input: {
    sessionId: string
    userId: string
    threadId: string
  }) => ports.archiveAgentThreadForSession(input)

  const updateAgentThreadTitle = (
    input: Parameters<AgentServicePorts["renameAgentThreadForSession"]>[0]
  ) => ports.renameAgentThreadForSession(input)

  const prepareAgentChat = (
    input: Parameters<AgentServicePorts["prepareAgentChatForSession"]>[0]
  ) => ports.prepareAgentChatForSession(input)

  const prepareAgentClientToolContinuation = (
    input: Parameters<
      AgentServicePorts["prepareAgentClientToolContinuationForSession"]
    >[0]
  ) => ports.prepareAgentClientToolContinuationForSession(input)

  const listAgentMessages = (
    input: Parameters<AgentServicePorts["listAgentMessagesForSession"]>[0]
  ) => ports.listAgentMessagesForSession(input)

  const getAgentThreadContext = (
    input: Parameters<AgentServicePorts["getAgentThreadContextForSession"]>[0]
  ) => ports.getAgentThreadContextForSession(input)

  const getAgentMonthlyUsage = (
    input: Parameters<AgentServicePorts["getAgentMonthlyUsageForSession"]>[0]
  ) => ports.getAgentMonthlyUsageForSession(input)

  const getAgentOrganizationUsage = (
    input: Parameters<
      AgentServicePorts["getAgentOrganizationUsageForSession"]
    >[0]
  ) => ports.getAgentOrganizationUsageForSession(input)

  const forwardAgentChat = async (
    input: AgentRuntimeChatInput,
    signal?: AbortSignal
  ): Promise<Response> => {
    let response: Response
    try {
      response = await ports.fetchAgentRuntime(
        new Request("https://agent.internal/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal,
        })
      )
    } catch (cause) {
      throw publicErrors.unavailable(cause)
    }

    if (response.status !== 200) {
      const status = response.status
      const retryAfter =
        status === 429
          ? boundedRetryAfter(response.headers.get("retry-after"))
          : null
      await response.body?.cancel().catch(() => undefined)
      const publicStatus =
        status === 400 || status === 409 || status === 429 ? status : 503
      return new Response(
        publicStatus === 400
          ? "Invalid agent request"
          : publicStatus === 409
            ? "Agent run already in progress"
            : publicStatus === 429
              ? "Agent capacity temporarily limited"
              : "Agent unavailable",
        {
          status: publicStatus,
          headers: {
            "cache-control": "private, no-store",
            "content-type": "text/plain; charset=utf-8",
            ...(retryAfter === null
              ? {}
              : { "retry-after": String(retryAfter) }),
          },
        }
      )
    }

    if (
      response.body === null ||
      !response.headers.get("content-type")?.startsWith("text/event-stream")
    ) {
      await response.body?.cancel().catch(() => undefined)
      throw publicErrors.unavailable(
        new Error("Invalid Agent runtime response")
      )
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-type": "text/event-stream",
        "x-accel-buffering": "no",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    })
  }

  const forwardAgentActionResume = async (
    input: AgentRuntimeResumeInput
  ): Promise<AgentActionExecutionResult> => {
    let response: Response
    try {
      response = await ports.fetchAgentRuntime(
        new Request("https://agent.internal/actions/resume", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        })
      )
    } catch (cause) {
      throw publicErrors.unavailable(cause)
    }

    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined)
      throw publicErrors.unavailable(new Error("Agent action resume failed"))
    }

    try {
      return v.parse(agentActionExecutionResultModel, await response.json())
    } catch (cause) {
      throw publicErrors.unavailable(cause)
    }
  }

  const revokeAgentContext = (input: { sessionId: string; userId: string }) =>
    ports.revokeCurrentAgentContext(input)

  const getAgentAction = (input: {
    actionId: string
    sessionId: string
    userId: string
  }) => ports.getAgentActionForSession(input)

  const decideAgentAction = (input: {
    actionId: string
    decision: "yes" | "no"
    idempotencyKey: string
    sessionId: string
    userId: string
  }) => ports.decideAgentActionForSession(input)

  const resumeAgentAction = async (input: {
    actionId: string
    sessionId: string
    userId: string
  }): Promise<AgentActionExecutionResult> => {
    const preparation = await ports.prepareAgentActionResumeForSession(input)
    if (preparation.kind === "receipt") return preparation.result
    return forwardAgentActionResume({
      actionId: input.actionId,
      resumeTicket: preparation.resume.ticket,
    })
  }

  const getAgentApprovalPolicy = (input: {
    sessionId: string
    userId: string
    threadId: string
  }) => ports.getAgentApprovalPolicyForSession(input)

  const putAgentApprovalPolicy = (input: {
    sessionId: string
    userId: string
    threadId: string
    mode: AgentThreadPermissionMode
  }) => ports.putAgentApprovalPolicyForSession(input)

  return {
    archiveAgentThread,
    createAgentThread,
    decideAgentAction,
    forwardAgentChat,
    getAgentAction,
    getAgentApprovalPolicy,
    getAgentMonthlyUsage,
    getAgentOrganizationUsage,
    getAgentThreadContext,
    listAgentMessages,
    listAgentThreads,
    normalizeAgentTimezone,
    prepareAgentChat,
    prepareAgentClientToolContinuation,
    putAgentApprovalPolicy,
    resumeAgentAction,
    revokeAgentContext,
    updateAgentThreadTitle,
  }
}

export type AgentService = ReturnType<typeof createAgentService>
