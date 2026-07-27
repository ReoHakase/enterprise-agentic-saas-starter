import { MessageList } from "@mastra/core/agent/message-list"
import type { Mastra } from "@mastra/core/mastra"
import { Memory } from "@mastra/memory"

import { toLiveConnectionGrant } from "../core/policy/grant"
import type { AgentControlPlanePort } from "./ports"
import { readBoundedPrivateJson } from "./request"

type MemoryRouteEnvironment = { AGENT_INTERNAL_API: unknown }
type MemoryRouteDependencies = {
  createControlPlane(
    binding: unknown
  ): Pick<AgentControlPlanePort, "consumeConnectionTicket">
  mastra: Mastra
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

const projectNativeHistoryPart = (
  value: unknown
): Record<string, unknown> | undefined => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const part = Object.fromEntries(Object.entries(value))
  if (part.type === "reasoning") return undefined
  if (part.type === "text" && typeof part.text === "string") {
    return { type: "text", text: part.text }
  }
  if (
    (part.type === "data-agent-assets" ||
      part.type === "data-context-reference" ||
      part.type === "data-activity") &&
    "data" in part
  ) {
    return { type: part.type, data: part.data }
  }
  if (part.type === "source-url") {
    return {
      type: "source-url",
      sourceId: part.sourceId,
      url: part.url,
      ...(typeof part.title === "string" ? { title: part.title } : {}),
    }
  }
  if (part.type === "step-start") return { type: "step-start" }
  const toolType =
    part.type === "dynamic-tool" && typeof part.toolName === "string"
      ? `tool-${part.toolName}`
      : typeof part.type === "string" && part.type.startsWith("tool-")
        ? part.type
        : undefined
  if (!toolType) return undefined
  return {
    type: toolType,
    toolCallId: part.toolCallId,
    state: part.state,
    ...("input" in part ? { input: part.input } : {}),
    ...("output" in part ? { output: part.output } : {}),
    ...(typeof part.errorText === "string"
      ? { errorText: part.errorText }
      : {}),
  }
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
  } catch {
    return unavailable()
  }
}

export const handleMemoryThreads = async (
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
        key !== "ticket" && key !== "threadId" && key !== "registryThreadIds"
    )
  ) {
    return invalidRequest()
  }
  const record = Object.fromEntries(Object.entries(rawInput))
  const { registryThreadIds, ticket, threadId } = record
  if (
    typeof ticket !== "string" ||
    typeof threadId !== "string" ||
    !Array.isArray(registryThreadIds) ||
    registryThreadIds.length < 1 ||
    registryThreadIds.length > 1_000
  ) {
    return invalidRequest()
  }
  const validatedThreadIds: string[] = []
  for (const id of registryThreadIds) {
    if (
      typeof id !== "string" ||
      id.length < 1 ||
      id.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(id)
    ) {
      return invalidRequest()
    }
    validatedThreadIds.push(id)
  }
  if (new Set(validatedThreadIds).size !== validatedThreadIds.length) {
    return invalidRequest()
  }

  const api = dependencies.createControlPlane(environment.AGENT_INTERNAL_API)
  try {
    const connection = await api.consumeConnectionTicket({ ticket, threadId })
    if (!toLiveConnectionGrant(connection, threadId)) return unavailable()
    const memory = await dependencies.mastra
      .getAgentById("product-agent")
      .getMemory()
    if (!(memory instanceof Memory)) return unavailable()
    const allowed = new Set(validatedThreadIds)
    const threads: Array<{ id: string; title: string; updatedAt: string }> = []
    for (let page = 0; page < 10_000; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Mastra storage pagination is sequential.
      const result = await memory.listThreads({
        page,
        perPage: 100,
        filter: { resourceId: connection.memoryResourceId },
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
      if (!result.hasMore) {
        return Response.json(threads, {
          headers: { "cache-control": "private, no-store" },
        })
      }
    }
    return unavailable()
  } catch {
    return unavailable()
  }
}
