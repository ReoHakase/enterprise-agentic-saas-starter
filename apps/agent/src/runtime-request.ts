import type {
  AgentCanonicalJsonValue,
  AgentCanonicalMessage,
  AgentRuntimeChatInput,
  AgentRuntimeResumeInput,
} from "@enterprise-agentic-saas/api/agent-client"
import { z } from "zod"

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/
const MAX_PRIVATE_REQUEST_CHARACTERS = 512 * 1024

const identifierSchema = z.string().regex(IDENTIFIER_PATTERN)
const isBoundedJson = (
  nested: unknown,
  depth = 0
): nested is AgentCanonicalJsonValue => {
  if (nested === null || typeof nested === "boolean") return true
  if (typeof nested === "number") return Number.isFinite(nested)
  if (typeof nested === "string") return nested.length <= 10_000
  if (depth >= 8 || typeof nested !== "object") return false
  if (Array.isArray(nested)) {
    return (
      nested.length <= 100 &&
      nested.every((item) => isBoundedJson(item, depth + 1))
    )
  }
  const entries = Object.entries(nested)
  return (
    entries.length <= 100 &&
    entries.every(
      ([key, item]) => key.length <= 128 && isBoundedJson(item, depth + 1)
    )
  )
}

const boundedJsonSchema = z.custom<AgentCanonicalJsonValue>((value) =>
  isBoundedJson(value)
)

const canonicalToolTypes = [
  "tool-create_issue",
  "tool-delete_issue",
  "tool-get_issue",
  "tool-read_account_context",
  "tool-read_active_organization",
  "tool-search_issue_labels",
  "tool-search_issues",
  "tool-search_organization_members",
  "tool-ui_navigate",
  "tool-ui_open_issue",
  "tool-ui_patch_form_draft",
  "tool-ui_read_form_draft",
  "tool-ui_set_issue_query",
  "tool-update_issue",
  "tool-web_search",
] as const

const canonicalToolPartSchema = z
  .object({
    type: z.enum(canonicalToolTypes),
    toolCallId: identifierSchema,
    state: z.enum([
      "input-available",
      "output-available",
      "output-denied",
      "output-error",
    ]),
    input: boundedJsonSchema.optional(),
    output: boundedJsonSchema.optional(),
    errorText: z.string().max(2_000).optional(),
  })
  .strict()

const canonicalPartSchema = z.union([
  z
    .object({
      type: z.literal("text"),
      text: z.string().max(50_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("data-agent-assets"),
      data: z
        .object({
          assetIds: z
            .array(identifierSchema)
            .min(1)
            .max(4)
            .refine((items) => new Set(items).size === items.length),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ type: z.literal("reasoning"), text: z.string().max(20_000) })
    .strict(),
  z
    .object({
      type: z.literal("source-url"),
      sourceId: identifierSchema,
      url: z
        .url()
        .max(2_048)
        .refine((value) =>
          ["http:", "https:"].includes(new URL(value).protocol)
        ),
      title: z.string().max(500).optional(),
    })
    .strict(),
  z.object({ type: z.literal("step-start") }).strict(),
  canonicalToolPartSchema,
])

const canonicalMessageSchema = z
  .object({
    id: identifierSchema,
    role: z.enum(["user", "assistant"]),
    parts: z.array(canonicalPartSchema).min(1).max(64),
  })
  .strict()
  .refine((message) => JSON.stringify(message).length <= 131_072)
  .refine((message) =>
    message.role === "assistant"
      ? message.parts.every((part) => part.type !== "data-agent-assets")
      : message.parts.length <= 2 &&
        message.parts[0]?.type === "text" &&
        (message.parts.length === 1 ||
          message.parts[1]?.type === "data-agent-assets")
  )

const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .transform((value, context) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: value,
      }).resolvedOptions().timeZone
    } catch {
      context.addIssue({ code: "custom", message: "Invalid timezone" })
      return z.NEVER
    }
  })

const chatInputSchema = z
  .object({
    ticket: z.string().regex(TOKEN_PATTERN),
    threadId: identifierSchema,
    clientMessageId: identifierSchema,
    messages: z.array(canonicalMessageSchema).min(1).max(40),
    assetIds: z
      .array(identifierSchema)
      .max(4)
      .refine((items) => new Set(items).size === items.length),
    timezone: timezoneSchema,
    trigger: z.enum(["user_message", "client_tool_result"]),
  })
  .strict()
  .refine((input) => {
    const current = input.messages.at(-1)
    if (input.trigger === "client_tool_result") {
      return (
        input.assetIds.length === 0 &&
        input.clientMessageId.startsWith("continuation_") &&
        current?.role === "assistant" &&
        current.parts.some(
          (part) =>
            part.type.startsWith("tool-ui_") &&
            "state" in part &&
            (part.state === "output-available" || part.state === "output-error")
        )
      )
    }
    if (current?.role !== "user" || current.id !== input.clientMessageId) {
      return false
    }
    const assetPart = current.parts[1]
    const messageAssetIds =
      assetPart?.type === "data-agent-assets" ? assetPart.data.assetIds : []
    return (
      messageAssetIds.length === input.assetIds.length &&
      messageAssetIds.every(
        (assetId, index) => assetId === input.assetIds[index]
      )
    )
  })

const resumeInputSchema = z
  .object({
    actionId: identifierSchema,
    resumeTicket: z.string().regex(TOKEN_PATTERN),
  })
  .strict()

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
  const result = chatInputSchema.safeParse(value)
  if (!result.success) return undefined
  const input: AgentRuntimeChatInput & { messages: AgentCanonicalMessage[] } =
    result.data
  return input
}

export const parseAgentRuntimeResumeInput = (
  value: unknown
): AgentRuntimeResumeInput | undefined => {
  const result = resumeInputSchema.safeParse(value)
  return result.success ? result.data : undefined
}
