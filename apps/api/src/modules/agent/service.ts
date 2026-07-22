import type { Db } from "@enterprise-agentic-saas/db"
import type { AgentApprovalPolicyMode } from "@enterprise-agentic-saas/db/schema"
import * as v from "valibot"

import type {
  AgentActionExecutionResult,
  AgentRuntimeChatInput,
  AgentRuntimeResumeInput,
} from "../../agent-client"
import { publicErrors } from "../../errors/app-error"
import {
  deleteAgentApprovalPolicyForSession,
  decideAgentActionForSession,
  getAgentActionForSession,
  getAgentApprovalPolicyForSession,
  issueAgentActionResumeTicket,
  prepareAgentActionResumeForSession,
  putAgentApprovalPolicyForSession,
} from "./actions/repository"
import { agentActionExecutionResultModel } from "./model"
import { getAgentRuntime } from "./runtime"
import {
  archiveAgentThreadForSession,
  createAgentThreadForSession,
  issueAgentConnectionTicket,
  getAgentThreadContextForSession,
  listAgentMessagesForSession,
  listAgentThreadsForSession,
  prepareAgentClientToolContinuationForSession,
  prepareAgentChatForSession,
  revokeCurrentAgentContext,
} from "./threads/repository"
import {
  getAgentMonthlyUsageForSession,
  getAgentOrganizationUsageForSession,
} from "./usage/repository"

const DEFAULT_THREAD_TITLE = "New conversation"

const boundedRetryAfter = (value: string | null): number => {
  if (value && /^[1-9][0-9]{0,4}$/.test(value)) {
    const seconds = Number(value)
    if (seconds <= 86_400) return seconds
  }
  return 1
}

export const listAgentThreads = (
  db: Db,
  input: { sessionId: string; userId: string }
) => listAgentThreadsForSession(db, input)

export const createAgentThread = (
  db: Db,
  input: { sessionId: string; userId: string; title?: string }
) =>
  createAgentThreadForSession(db, {
    ...input,
    title: input.title?.trim() || DEFAULT_THREAD_TITLE,
  })

export const archiveAgentThread = (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string }
) => archiveAgentThreadForSession(db, input)

export const createAgentConnection = (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string }
) => issueAgentConnectionTicket(db, input)

export const prepareAgentChat = (
  db: Db,
  input: Parameters<typeof prepareAgentChatForSession>[1]
) => prepareAgentChatForSession(db, input)

export const prepareAgentClientToolContinuation = (
  db: Db,
  input: Parameters<typeof prepareAgentClientToolContinuationForSession>[1]
) => prepareAgentClientToolContinuationForSession(db, input)

export const listAgentMessages = (
  db: Db,
  input: Parameters<typeof listAgentMessagesForSession>[1]
) => listAgentMessagesForSession(db, input)

export const getAgentThreadContext = (
  db: Db,
  input: Parameters<typeof getAgentThreadContextForSession>[1]
) => getAgentThreadContextForSession(db, input)

export const getAgentMonthlyUsage = (
  db: Db,
  input: Parameters<typeof getAgentMonthlyUsageForSession>[1]
) => getAgentMonthlyUsageForSession(db, input)

export const getAgentOrganizationUsage = (
  db: Db,
  input: Parameters<typeof getAgentOrganizationUsageForSession>[1]
) => getAgentOrganizationUsageForSession(db, input)

export const normalizeAgentTimezone = (value: string): string => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone
  } catch {
    throw publicErrors.validation("Invalid agent timezone")
  }
}

export const forwardAgentChat = async (
  input: AgentRuntimeChatInput,
  signal?: AbortSignal
): Promise<Response> => {
  let response: Response
  try {
    response = await getAgentRuntime().fetch(
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
          ...(retryAfter === null ? {} : { "retry-after": String(retryAfter) }),
        },
      }
    )
  }

  if (
    response.body === null ||
    !response.headers.get("content-type")?.startsWith("text/event-stream")
  ) {
    await response.body?.cancel().catch(() => undefined)
    throw publicErrors.unavailable(new Error("Invalid Agent runtime response"))
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

export const forwardAgentActionResume = async (
  input: AgentRuntimeResumeInput
): Promise<AgentActionExecutionResult> => {
  let response: Response
  try {
    response = await getAgentRuntime().fetch(
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

export const revokeAgentContext = (
  db: Db,
  input: { sessionId: string; userId: string }
) => revokeCurrentAgentContext(db, input)

export const getAgentAction = (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string }
) => getAgentActionForSession(db, input)

export const decideAgentAction = (
  db: Db,
  input: {
    actionId: string
    decision: "yes" | "no"
    idempotencyKey: string
    sessionId: string
    userId: string
  }
) => decideAgentActionForSession(db, input)

export const createAgentActionResumeTicket = (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string }
) => issueAgentActionResumeTicket(db, input)

export const resumeAgentAction = async (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string }
): Promise<AgentActionExecutionResult> => {
  const preparation = await prepareAgentActionResumeForSession(db, input)
  if (preparation.kind === "receipt") return preparation.result
  return forwardAgentActionResume({
    actionId: input.actionId,
    resumeTicket: preparation.resume.ticket,
  })
}

export const getAgentApprovalPolicy = (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string }
) => getAgentApprovalPolicyForSession(db, input)

export const deleteAgentApprovalPolicy = (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string }
) => deleteAgentApprovalPolicyForSession(db, input)

export const putAgentApprovalPolicy = (
  db: Db,
  input: {
    sessionId: string
    userId: string
    threadId: string
    mode: AgentApprovalPolicyMode
    expiresInSeconds: number
    destructiveConfirmation?: "ALLOW_ISSUE_DELETE"
  }
) => putAgentApprovalPolicyForSession(db, input)
