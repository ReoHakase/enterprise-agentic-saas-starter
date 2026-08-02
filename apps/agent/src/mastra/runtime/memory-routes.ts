import {
  agentUiMessagePartSchema,
  canonicalizePublicHttpUrl,
  type AgentUiMessagePart,
} from "@enterprise-agentic-saas/agent-contracts"
import { MessageList } from "@mastra/core/agent/message-list"
import type { Mastra } from "@mastra/core/mastra"
import { Memory } from "@mastra/memory"
import * as v from "valibot"

import type { AgentFailureCode } from "../adapters/telemetry/capture"
import { reportDevelopmentCauseChain } from "../adapters/telemetry/development-error"
import { toLiveConnectionGrant } from "../core/policy/grant"
import type { AgentControlPlanePort } from "./ports"
import { readBoundedPrivateJson } from "./request"

type MemoryRouteEnvironment = {
  AGENT_INTERNAL_API: unknown
  AGENT_EVAL_ALLOWED_TOOLS?: string
  DEV_SESSION_ID?: string
  DEV_WORKTREE_ID?: string
  NODE_ENV?: string
  OTEL_EXPORTER_OTLP_ENDPOINT?: string
}
type MemoryRouteDependencies = {
  captureFailure?: (code: AgentFailureCode) => void
  createControlPlane(
    binding: unknown
  ): Pick<AgentControlPlanePort, "consumeConnectionTicket">
  mastra: Mastra
}

const reportMemoryFailure = (
  environment: MemoryRouteEnvironment,
  dependencies: MemoryRouteDependencies,
  operation: "memory-history" | "memory-threads",
  cause: unknown
) => {
  reportDevelopmentCauseChain(environment, operation, cause)
  dependencies.captureFailure?.("memory_failed")
}

const fixedResponse = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  })

const invalidRequest = (): Response =>
  fixedResponse(400, "Invalid agent request")
const unavailable = (): Response => fixedResponse(503, "Agent unavailable")
type MemoryThreadsInput = {
  registryThreadIds: string[]
  ticket: string
  threadId: string
}

const isMemoryThreadId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 1 &&
  value.length <= 128 &&
  /^[A-Za-z0-9_-]+$/.test(value)

const readMemoryThreadsInput = async (
  request: Request
): Promise<MemoryThreadsInput | undefined> => {
  let rawInput: unknown
  try {
    rawInput = await readBoundedPrivateJson(request)
  } catch {
    return undefined
  }
  if (
    typeof rawInput !== "object" ||
    rawInput === null ||
    Array.isArray(rawInput) ||
    Object.keys(rawInput).some(
      (key) =>
        key !== "ticket" && key !== "threadId" && key !== "registryThreadIds"
    )
  ) {
    return undefined
  }
  const { registryThreadIds, ticket, threadId } = Object.fromEntries(
    Object.entries(rawInput)
  )
  if (
    typeof ticket !== "string" ||
    !isMemoryThreadId(threadId) ||
    !Array.isArray(registryThreadIds) ||
    registryThreadIds.length < 1 ||
    registryThreadIds.length > 1_000 ||
    !registryThreadIds.every(isMemoryThreadId)
  ) {
    return undefined
  }
  const validatedThreadIds = [...registryThreadIds]
  if (new Set(validatedThreadIds).size !== validatedThreadIds.length) {
    return undefined
  }
  return { registryThreadIds: validatedThreadIds, ticket, threadId }
}

const listAllowedMemoryThreads = async (
  memory: Memory,
  resourceId: string,
  allowed: ReadonlySet<string>
): Promise<
  Array<{ id: string; title: string; updatedAt: string }> | undefined
> => {
  const threads: Array<{ id: string; title: string; updatedAt: string }> = []
  for (let page = 0; page < 10_000; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Mastra storage pagination is sequential.
    const result = await memory.listThreads({
      page,
      perPage: 100,
      filter: { resourceId },
      orderBy: { field: "updatedAt", direction: "DESC" },
    })
    for (const thread of result.threads) {
      if (!allowed.has(thread.id)) continue
      threads.push({
        id: thread.id,
        title: thread.title || "New conversation",
        updatedAt: thread.updatedAt.toISOString(),
      })
    }
    if (!result.hasMore) return threads
  }
  return undefined
}

const projectNativeApproval = (value: unknown) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return
  const approval = Object.fromEntries(Object.entries(value))
  if (
    typeof approval.id !== "string" ||
    approval.id.length < 1 ||
    approval.id.length > 512 ||
    (approval.approved !== undefined && typeof approval.approved !== "boolean")
  ) {
    return
  }
  return {
    id: approval.id,
    ...(typeof approval.approved === "boolean"
      ? { approved: approval.approved }
      : {}),
  }
}

const validatedHistoryPart = (
  candidate: unknown
): AgentUiMessagePart | undefined => {
  const parsed = v.safeParse(agentUiMessagePartSchema, candidate)
  return parsed.success ? parsed.output : undefined
}

const projectNativeHistoryPart = (
  value: unknown
): AgentUiMessagePart | undefined => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const part = Object.fromEntries(Object.entries(value))
  if (part.type === "reasoning" && typeof part.text === "string") {
    return validatedHistoryPart({
      type: "reasoning",
      text: part.text,
      state: "done",
    })
  }
  if (part.type === "text" && typeof part.text === "string") {
    return validatedHistoryPart({ type: "text", text: part.text })
  }
  if (
    (part.type === "data-agent-assets" ||
      part.type === "data-context-reference") &&
    "data" in part
  ) {
    return validatedHistoryPart({ type: part.type, data: part.data })
  }
  if (part.type === "source-url") {
    const url = canonicalizePublicHttpUrl(part.url)
    if (!url) return undefined
    return validatedHistoryPart({
      type: "source-url",
      sourceId: part.sourceId,
      url,
      ...(typeof part.title === "string" ? { title: part.title } : {}),
    })
  }
  if (part.type === "step-start") {
    return validatedHistoryPart({ type: "step-start" })
  }
  const toolType =
    part.type === "dynamic-tool" && typeof part.toolName === "string"
      ? `tool-${part.toolName}`
      : typeof part.type === "string" && part.type.startsWith("tool-")
        ? part.type
        : undefined
  if (!toolType) return undefined
  const safeApproval = projectNativeApproval(part.approval)
  return validatedHistoryPart({
    type: toolType,
    toolCallId: part.toolCallId,
    state: part.state,
    ...("input" in part ? { input: part.input } : {}),
    ...("output" in part
      ? {
          output: toolType === "tool-skill" ? { activated: true } : part.output,
        }
      : {}),
    ...(safeApproval ? { approval: safeApproval } : {}),
    ...(typeof part.errorText === "string"
      ? { errorText: "Agent tool execution failed." }
      : {}),
  })
}

export const handleMemoryHistory = async (
  request: Request,
  environment: MemoryRouteEnvironment,
  dependencies: MemoryRouteDependencies
): Promise<Response> => {
  let rawInput: unknown
  try {
    rawInput = await readBoundedPrivateJson(request)
  } catch {
    return invalidRequest()
  }
  if (
    typeof rawInput !== "object" ||
    rawInput === null ||
    Array.isArray(rawInput) ||
    Object.keys(rawInput).some(
      (key) =>
        key !== "ticket" &&
        key !== "threadId" &&
        key !== "page" &&
        key !== "perPage"
    )
  ) {
    return invalidRequest()
  }
  const record = Object.fromEntries(Object.entries(rawInput))
  const { page, perPage, ticket, threadId } = record
  if (
    typeof ticket !== "string" ||
    typeof threadId !== "string" ||
    typeof page !== "number" ||
    !Number.isInteger(page) ||
    page < 0 ||
    typeof perPage !== "number" ||
    !Number.isInteger(perPage) ||
    perPage < 1 ||
    perPage > 100 ||
    threadId.length < 1 ||
    threadId.length > 128
  ) {
    return invalidRequest()
  }

  const api = dependencies.createControlPlane(environment.AGENT_INTERNAL_API)
  try {
    const connection = await api.consumeConnectionTicket({ ticket, threadId })
    const liveGrant = toLiveConnectionGrant(connection, threadId)
    if (!liveGrant) return unavailable()
    const productAgent = dependencies.mastra.getAgentById("product-agent")
    const memory = await productAgent.getMemory()
    if (!(memory instanceof Memory)) return unavailable()
    const thread = await memory.getThreadById({
      resourceId: connection.memoryResourceId,
      threadId,
    })
    if (!thread) {
      return Response.json({
        hasMore: false,
        messages: [],
        page,
        perPage,
        total: 0,
      })
    }
    const recalled = await memory.recall({
      page,
      perPage,
      resourceId: connection.memoryResourceId,
      threadId,
    })
    const messages = new MessageList({
      resourceId: connection.memoryResourceId,
      threadId,
    })
      .add(recalled.messages, "memory")
      .get.all.aiV6.ui()
      .map(({ id, parts, role }) => ({
        id,
        role,
        parts: parts
          .map((part) => projectNativeHistoryPart(part))
          .filter((part) => part !== undefined),
      }))
      .filter(({ parts }) => parts.length > 0)
    return Response.json(
      {
        hasMore: recalled.hasMore,
        messages,
        page: recalled.page,
        perPage: recalled.perPage,
        total: recalled.total,
      },
      { headers: { "cache-control": "private, no-store" } }
    )
  } catch (cause) {
    reportMemoryFailure(environment, dependencies, "memory-history", cause)
    return unavailable()
  }
}

export const handleMemoryThreads = async (
  request: Request,
  environment: MemoryRouteEnvironment,
  dependencies: MemoryRouteDependencies
): Promise<Response> => {
  const input = await readMemoryThreadsInput(request)
  if (!input) return invalidRequest()
  const { registryThreadIds, ticket, threadId } = input

  const api = dependencies.createControlPlane(environment.AGENT_INTERNAL_API)
  try {
    const connection = await api.consumeConnectionTicket({ ticket, threadId })
    if (!toLiveConnectionGrant(connection, threadId)) return unavailable()
    const memory = await dependencies.mastra
      .getAgentById("product-agent")
      .getMemory()
    if (!(memory instanceof Memory)) return unavailable()
    const threads = await listAllowedMemoryThreads(
      memory,
      connection.memoryResourceId,
      new Set(registryThreadIds)
    )
    return threads
      ? Response.json(threads, {
          headers: { "cache-control": "private, no-store" },
        })
      : unavailable()
  } catch (cause) {
    reportMemoryFailure(environment, dependencies, "memory-threads", cause)
    return unavailable()
  }
}
