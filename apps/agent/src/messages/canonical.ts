import type {
  AgentCanonicalJsonValue,
  AgentCanonicalMessage,
  AgentCanonicalMessagePart,
  AgentCanonicalToolName,
  AgentCanonicalToolPart,
} from "@enterprise-agentic-saas/api/agent-client"
import type { UIMessage } from "ai"

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_MESSAGE_CHARACTERS = 131_072

const canonicalToolNames: ReadonlySet<string> = new Set<AgentCanonicalToolName>(
  [
    "create_issue",
    "delete_issue",
    "get_issue",
    "read_account_context",
    "read_active_organization",
    "rename_thread",
    "search_issue_labels",
    "search_issues",
    "search_organization_members",
    "ui_navigate",
    "ui_open_issue",
    "ui_patch_form_draft",
    "ui_read_form_draft",
    "ui_set_issue_query",
    "update_issue",
    "web_search",
  ]
)

const isCanonicalToolName = (value: unknown): value is AgentCanonicalToolName =>
  typeof value === "string" && canonicalToolNames.has(value)

const safeIdentifier = (value: unknown, prefix: string): string =>
  typeof value === "string" && IDENTIFIER_PATTERN.test(value)
    ? value
    : `${prefix}_${crypto.randomUUID()}`

const sanitizeJson = (
  value: unknown,
  depth = 0
): AgentCanonicalJsonValue | undefined => {
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") return value.slice(0, 10_000)
  if (depth >= 8 || typeof value !== "object") return undefined
  if (Array.isArray(value)) {
    const items: AgentCanonicalJsonValue[] = []
    for (const item of value.slice(0, 100)) {
      const sanitized = sanitizeJson(item, depth + 1)
      if (sanitized !== undefined) items.push(sanitized)
    }
    return items
  }
  const output: Record<string, AgentCanonicalJsonValue> = {}
  for (const [key, nested] of Object.entries(value).slice(0, 100)) {
    if (key.length > 128) continue
    const sanitized = sanitizeJson(nested, depth + 1)
    if (sanitized !== undefined) output[key] = sanitized
  }
  return output
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const isNonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0

const sanitizeToolPart = (
  part: Record<string, unknown>
): AgentCanonicalToolPart | undefined => {
  const name =
    part.type === "dynamic-tool"
      ? part.toolName
      : typeof part.type === "string" && part.type.startsWith("tool-")
        ? part.type.slice(5)
        : undefined
  if (!isCanonicalToolName(name)) {
    return undefined
  }
  const state = part.state
  if (
    state !== "input-available" &&
    state !== "output-available" &&
    state !== "output-denied" &&
    state !== "output-error"
  ) {
    return undefined
  }
  const input = sanitizeJson(part.input)
  const output = sanitizeJson(part.output)
  return {
    type: `tool-${name}`,
    toolCallId: safeIdentifier(part.toolCallId, "call"),
    state,
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
    ...(state === "output-error" && typeof part.errorText === "string"
      ? { errorText: part.errorText.slice(0, 2_000) }
      : {}),
  }
}

const sanitizePart = (part: unknown): AgentCanonicalMessagePart | undefined => {
  if (!isRecord(part) || typeof part.type !== "string") return undefined
  if (part.type === "text" && typeof part.text === "string") {
    return { type: "text", text: part.text.slice(0, 50_000) }
  }
  if (part.type === "data-activity" && isRecord(part.data)) {
    const { kind, label, status } = part.data
    if (
      (kind === "status" || kind === "tool") &&
      (status === "running" || status === "completed" || status === "failed") &&
      typeof label === "string" &&
      label.length > 0
    ) {
      return {
        type: "data-activity",
        data: { kind, status, label: label.slice(0, 200) },
      }
    }
  }
  if (part.type === "data-context-budget" && isRecord(part.data)) {
    const data = part.data
    const estimated = isRecord(data.estimated) ? data.estimated : null
    if (
      isNonNegativeInteger(data.contextWindowTokens) &&
      Number(data.contextWindowTokens) > 0 &&
      isNonNegativeInteger(data.reservedOutputTokens) &&
      Number(data.reservedOutputTokens) > 0 &&
      estimated &&
      isNonNegativeInteger(estimated.system) &&
      isNonNegativeInteger(estimated.skills) &&
      isNonNegativeInteger(estimated.tools) &&
      isNonNegativeInteger(estimated.history) &&
      isNonNegativeInteger(estimated.pageContext) &&
      isNonNegativeInteger(estimated.attachments) &&
      isNonNegativeInteger(estimated.total) &&
      (data.observedInputTokens === null ||
        isNonNegativeInteger(data.observedInputTokens)) &&
      (data.level === "normal" ||
        data.level === "notice" ||
        data.level === "warning" ||
        data.level === "critical")
    ) {
      return {
        type: "data-context-budget",
        data: {
          contextWindowTokens: Number(data.contextWindowTokens),
          reservedOutputTokens: Number(data.reservedOutputTokens),
          estimated: {
            system: Number(estimated.system),
            skills: Number(estimated.skills),
            tools: Number(estimated.tools),
            history: Number(estimated.history),
            pageContext: Number(estimated.pageContext),
            attachments: Number(estimated.attachments),
            total: Number(estimated.total),
          },
          observedInputTokens:
            data.observedInputTokens === null
              ? null
              : Number(data.observedInputTokens),
          level: data.level,
        },
      }
    }
  }
  if (part.type === "data-thread-title" && isRecord(part.data)) {
    const { renamed, threadId, title } = part.data
    if (
      typeof threadId === "string" &&
      IDENTIFIER_PATTERN.test(threadId) &&
      typeof title === "string" &&
      title.length > 0 &&
      typeof renamed === "boolean"
    ) {
      return {
        type: "data-thread-title",
        data: { threadId, title: title.slice(0, 80), renamed },
      }
    }
  }
  if (part.type === "reasoning" && typeof part.text === "string") {
    return { type: "reasoning", text: part.text.slice(0, 20_000) }
  }
  if (part.type === "step-start") return { type: "step-start" }
  if (part.type === "source-url" && typeof part.url === "string") {
    try {
      const url = new URL(part.url)
      if (
        !["http:", "https:"].includes(url.protocol) ||
        part.url.length > 2_048
      ) {
        return undefined
      }
      return {
        type: "source-url",
        sourceId: safeIdentifier(part.sourceId, "source"),
        url: part.url,
        ...(typeof part.title === "string"
          ? { title: part.title.slice(0, 500) }
          : {}),
      }
    } catch {
      return undefined
    }
  }
  return sanitizeToolPart(part)
}

export const sanitizeAssistantMessage = (message: {
  id: unknown
  parts: unknown[]
  role?: unknown
}): AgentCanonicalMessage => {
  const parts: AgentCanonicalMessagePart[] = []
  for (const rawPart of message.parts.slice(0, 64)) {
    const part = sanitizePart(rawPart)
    if (part === undefined) continue
    const candidate = [...parts, part]
    if (
      JSON.stringify({
        id: message.id,
        role: "assistant",
        parts: candidate,
      }).length > MAX_MESSAGE_CHARACTERS
    ) {
      break
    }
    parts.push(part)
  }
  if (parts.length === 0) {
    parts.push({ type: "text", text: "応答を完了できませんでした。" })
  }
  return {
    id: safeIdentifier(message.id, "message"),
    role: "assistant",
    parts,
  }
}

type ModelUiPart = UIMessage["parts"][number]

const toModelUiPart = (
  part: AgentCanonicalMessagePart
): ModelUiPart | undefined => {
  if (part.type === "data-agent-assets") return undefined
  if (!("toolCallId" in part)) return part
  const input = part.input ?? null
  if (part.state === "input-available") {
    return {
      type: part.type,
      toolCallId: part.toolCallId,
      state: part.state,
      input,
    }
  }
  if (part.state === "output-available") {
    return {
      type: part.type,
      toolCallId: part.toolCallId,
      state: part.state,
      input,
      output: part.output ?? null,
    }
  }
  return {
    type: part.type,
    toolCallId: part.toolCallId,
    state: "output-error",
    input,
    errorText:
      part.state === "output-error"
        ? (part.errorText ?? "Tool failed.")
        : "Tool output was denied.",
  }
}

export const toModelUiMessages = (
  messages: readonly AgentCanonicalMessage[]
): UIMessage[] => {
  const output: UIMessage[] = []
  for (const message of messages) {
    if (
      message.role === "assistant" &&
      message.parts.some(
        (part) =>
          part.type === "tool-create_issue" ||
          part.type === "tool-update_issue" ||
          part.type === "tool-delete_issue"
      )
    ) {
      // Approval state is canonical in API/Turso, while persisted UI tool
      // outputs intentionally remain an immutable proposal projection. Remove
      // that proposal turn from later model context so rejected or completed
      // payloads cannot be mistaken for a new instruction.
      if (output.at(-1)?.role === "user") output.pop()
      continue
    }
    const parts: ModelUiPart[] = []
    for (const part of message.parts) {
      const modelPart = toModelUiPart(part)
      if (modelPart) parts.push(modelPart)
    }
    if (parts.length > 0)
      output.push({ id: message.id, role: message.role, parts })
  }
  return output
}
