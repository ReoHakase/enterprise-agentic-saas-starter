import {
  agentRuntimeChatInputSchema,
  agentRuntimeResumeInputSchema,
  type AgentRuntimeChatInput,
  type AgentRuntimeResumeInput,
} from "@enterprise-agentic-saas/agent-contracts"
import * as v from "valibot"

const MAX_PRIVATE_REQUEST_CHARACTERS = 5 * 1024 * 1024

const normalizeTimezone = (value: string): string | undefined => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

const hasConsistentChatState = (input: AgentRuntimeChatInput): boolean => {
  const current = input.message
  if (input.trigger === "client_tool_result") {
    return (
      input.assetIds.length === 0 &&
      input.reusableAssets.length === 0 &&
      input.contextReferences.length === 0 &&
      input.clientMessageId.startsWith("continuation_") &&
      current.role === "assistant" &&
      current.parts.some(
        (part) =>
          part.type.startsWith("tool-ui_") &&
          "state" in part &&
          (part.state === "output-available" || part.state === "output-error")
      )
    )
  }
  if (current.role !== "user" || current.id !== input.clientMessageId) {
    return false
  }
  const assetPart = current.parts.find(
    (part) => part.type === "data-agent-assets"
  )
  const messageAssetIds =
    assetPart?.type === "data-agent-assets" ? assetPart.data.assetIds : []
  const messageReferences = current.parts.flatMap((part) =>
    part.type === "data-context-reference" ? [part.data] : []
  )
  return (
    messageAssetIds.length === input.assetIds.length &&
    messageAssetIds.every(
      (assetId, index) => assetId === input.assetIds[index]
    ) &&
    messageReferences.length === input.contextReferences.length &&
    messageReferences.every((reference, index) => {
      const resolved = input.contextReferences[index]
      if (!resolved || resolved.kind !== reference.kind) return false
      return reference.kind === "current_page"
        ? resolved.kind === "current_page" && resolved.path === reference.path
        : resolved.kind !== "current_page" && resolved.id === reference.id
    })
  )
}

export const readBoundedPrivateJson = async (
  request: Request
): Promise<unknown> => {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
  if (contentType !== "application/json") {
    throw new Error("Invalid private Agent request")
  }
  const length = request.headers.get("content-length")
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > MAX_PRIVATE_REQUEST_CHARACTERS)
  ) {
    throw new Error("Invalid private Agent request")
  }
  const text = await request.text()
  if (text.length > MAX_PRIVATE_REQUEST_CHARACTERS) {
    throw new Error("Invalid private Agent request")
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error("Invalid private Agent request")
  }
}

export const parseAgentRuntimeChatInput = (
  value: unknown
): AgentRuntimeChatInput | undefined => {
  const result = v.safeParse(agentRuntimeChatInputSchema, value)
  if (!result.success || !hasConsistentChatState(result.output)) {
    return undefined
  }
  const timezone = normalizeTimezone(result.output.timezone)
  return timezone ? { ...result.output, timezone } : undefined
}

export const parseAgentRuntimeResumeInput = (
  value: unknown
): AgentRuntimeResumeInput | undefined => {
  const result = v.safeParse(agentRuntimeResumeInputSchema, value)
  return result.success ? result.output : undefined
}
