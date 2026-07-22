import type {
  AgentCanonicalJsonValue,
  AgentCanonicalMessage,
  AgentRuntimeChatInput,
  AgentRuntimeResumeInput,
} from "@enterprise-agentic-saas/api/agent-client"
import { z } from "zod"

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/
const MAX_PRIVATE_REQUEST_CHARACTERS = 5 * 1024 * 1024

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
  "tool-rename_thread",
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
    .object({
      type: z.literal("data-context-reference"),
      data: z.discriminatedUnion("kind", [
        z
          .object({
            kind: z.enum(["issue", "file", "member"]),
            id: identifierSchema,
            label: z.string().min(1).max(200),
          })
          .strict(),
        z
          .object({
            kind: z.literal("current_page"),
            path: z.string().min(1).max(500),
            label: z.string().min(1).max(200),
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("data-activity"),
      data: z
        .object({
          kind: z.enum(["status", "tool"]),
          status: z.enum(["running", "completed", "failed"]),
          label: z.string().min(1).max(200),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("data-context-budget"),
      data: z
        .object({
          contextWindowTokens: z.number().int().positive(),
          reservedOutputTokens: z.number().int().positive(),
          estimated: z
            .object({
              system: z.number().int().nonnegative(),
              skills: z.number().int().nonnegative(),
              tools: z.number().int().nonnegative(),
              history: z.number().int().nonnegative(),
              pageContext: z.number().int().nonnegative(),
              attachments: z.number().int().nonnegative(),
              total: z.number().int().nonnegative(),
            })
            .strict(),
          observedInputTokens: z.number().int().nonnegative().nullable(),
          level: z.enum(["normal", "notice", "warning", "critical"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("data-thread-title"),
      data: z
        .object({
          threadId: identifierSchema,
          title: z.string().min(1).max(80),
          renamed: z.boolean(),
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
  .refine((message) => {
    if (message.role === "assistant") {
      return message.parts.every(
        (part) =>
          part.type !== "data-agent-assets" &&
          part.type !== "data-context-reference"
      )
    }
    const assetIndexes = message.parts.flatMap((part, index) =>
      part.type === "data-agent-assets" ? [index] : []
    )
    return (
      message.parts.every(
        (part) =>
          part.type === "text" ||
          part.type === "data-context-reference" ||
          part.type === "data-agent-assets"
      ) &&
      assetIndexes.length <= 1 &&
      (assetIndexes.length === 0 ||
        assetIndexes[0] === message.parts.length - 1)
    )
  })

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

const resolvedContextReferenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("issue"),
      id: identifierSchema,
      number: z.number().int().positive(),
      title: z.string().max(200),
      description: z.string().max(50_000),
      status: z.enum(["open", "in_progress", "closed"]),
      priority: z.enum(["no_priority", "low", "medium", "high", "urgent"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("file"),
      id: identifierSchema,
      filename: z.string().max(255),
    })
    .strict(),
  z
    .object({
      kind: z.literal("member"),
      id: identifierSchema,
      name: z.string().max(200),
      role: z.enum(["super_admin", "admin", "member"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("current_page"),
      path: z.string().max(500),
      title: z.string().max(300),
    })
    .strict(),
])

const chatInputSchema = z
  .object({
    ticket: z.string().regex(TOKEN_PATTERN),
    threadId: identifierSchema,
    clientMessageId: identifierSchema,
    messages: z.array(canonicalMessageSchema).min(1).max(200),
    assetIds: z
      .array(identifierSchema)
      .max(4)
      .refine((items) => new Set(items).size === items.length),
    contextReferences: z.array(resolvedContextReferenceSchema).max(12),
    timezone: timezoneSchema,
    trigger: z.enum(["user_message", "client_tool_result"]),
  })
  .strict()
  .refine((input) => {
    const current = input.messages.at(-1)
    if (input.trigger === "client_tool_result") {
      return (
        input.assetIds.length === 0 &&
        input.contextReferences.length === 0 &&
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
