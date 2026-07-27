import * as v from "valibot"

import type {
  AgentActionExecutionResult,
  AgentRuntimeChatInput,
  AgentRuntimeResumeInput,
} from "../../agent-client"
import { publicErrors } from "../../errors/app-error"
import { agentActionExecutionResultModel } from "./action-schema"
import { agentMemoryThreadListModel, agentMessagePageModel } from "./model"
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

type AgentSessionIdentity = { sessionId: string; userId: string }

const listAgentThreadsWithMemory = async (
  ports: AgentServicePorts,
  input: AgentSessionIdentity
) => {
  const registryThreads = await ports.listAgentThreadsForSession(input)
  const first = registryThreads[0]
  if (!first) return []
  if (registryThreads.length > 1_000) {
    throw publicErrors.unavailable(new Error("Agent thread list unavailable"))
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          registryThreadIds: registryThreads.map((thread) => thread.id),
          threadId: first.id,
          ticket: capability.ticket,
        }),
      })
    )
  } catch (cause) {
    throw publicErrors.unavailable(cause)
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined)
    throw publicErrors.unavailable(new Error("Agent thread list unavailable"))
  }
  let memoryThreads: v.InferOutput<typeof agentMemoryThreadListModel>
  try {
    memoryThreads = v.parse(agentMemoryThreadListModel, await response.json())
  } catch (cause) {
    throw publicErrors.unavailable(cause)
  }
  const byId = new Map(memoryThreads.map((thread) => [thread.id, thread]))
  return registryThreads
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threadId: input.threadId,
          ticket: capability.ticket,
          page: input.page,
          perPage: input.perPage,
        }),
      })
    )
  } catch (cause) {
    throw publicErrors.unavailable(cause)
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined)
    throw publicErrors.unavailable(new Error("Agent history unavailable"))
  }
  try {
    return v.parse(agentMessagePageModel, await response.json())
  } catch (cause) {
    throw publicErrors.unavailable(cause)
  }
}

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

  const archiveAgentThread = (input: {
    sessionId: string
    userId: string
    threadId: string
  }) => ports.archiveAgentThreadForSession(input)

  const prepareAgentChat = (
    input: Parameters<AgentServicePorts["prepareAgentChatForSession"]>[0]
  ) => ports.prepareAgentChatForSession(input)

  const prepareAgentClientToolContinuation = (
    input: Parameters<
      AgentServicePorts["prepareAgentClientToolContinuationForSession"]
    >[0]
  ) => ports.prepareAgentClientToolContinuationForSession(input)

  const listAgentMessages = (
    input: AgentSessionIdentity & {
      page: number
      perPage: number
      threadId: string
    }
  ) => listAgentMessagesFromMemory(ports, input)

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
    listAgentMessages,
    listAgentThreads,
    normalizeAgentTimezone,
    prepareAgentChat,
    prepareAgentClientToolContinuation,
    putAgentApprovalPolicy,
    resumeAgentAction,
    revokeAgentContext,
  }
}

export type AgentService = ReturnType<typeof createAgentService>
