import * as v from "valibot"

import { agentIdentifierSchema } from "./schemas"

export type AgentJsonValue =
  | boolean
  | null
  | number
  | string
  | AgentJsonValue[]
  | { [key: string]: AgentJsonValue }

const isBoundedAgentJson = (
  value: unknown,
  depth = 0
): value is AgentJsonValue => {
  if (value === null || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value === "string") return value.length <= 50_000
  if (depth >= 8 || typeof value !== "object") return false
  if (Array.isArray(value)) {
    return (
      value.length <= 100 &&
      value.every((item) => isBoundedAgentJson(item, depth + 1))
    )
  }
  const entries = Object.entries(value)
  return (
    entries.length <= 100 &&
    entries.every(
      ([key, nested]) =>
        key.length <= 128 && isBoundedAgentJson(nested, depth + 1)
    )
  )
}

export const agentUiToolNames = [
  "add_issue_attachments",
  "create_issue",
  "delete_issue",
  "get_issue",
  "read_issue_attachment_image",
  "remove_issue_attachments",
  "read_account_context",
  "read_active_organization",
  "search_issue_labels",
  "search_issues",
  "search_organization_members",
  "skill",
  "ui_navigate",
  "ui_open_issue",
  "ui_patch_form_draft",
  "ui_read_form_draft",
  "ui_set_issue_query",
  "update_issue",
  "web_search",
] as const

const agentUiToolTypes = agentUiToolNames.map((name) => `tool-${name}` as const)
export const agentProviderOpaqueIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(512)
)
export const agentJsonValueSchema = v.custom<AgentJsonValue>(
  (value) => isBoundedAgentJson(value),
  "Invalid bounded JSON value"
)

const agentUiToolApprovalRequestSchema = v.strictObject({
  id: agentProviderOpaqueIdSchema,
})

const agentUiToolApprovalResponseSchema = v.strictObject({
  id: agentProviderOpaqueIdSchema,
  approved: v.boolean(),
  reason: v.optional(v.pipe(v.string(), v.maxLength(500))),
})

const agentUiToolApprovedSchema = v.strictObject({
  id: agentProviderOpaqueIdSchema,
  approved: v.literal(true),
  reason: v.optional(v.pipe(v.string(), v.maxLength(500))),
})

const agentUiToolDeniedApprovalSchema = v.strictObject({
  id: agentProviderOpaqueIdSchema,
  approved: v.literal(false),
  reason: v.optional(v.pipe(v.string(), v.maxLength(500))),
})

const agentUiToolPartBase = {
  type: v.picklist(agentUiToolTypes),
  toolCallId: agentProviderOpaqueIdSchema,
}

export const agentUiMessagePartSchema = v.union([
  v.strictObject({
    ...agentUiToolPartBase,
    state: v.literal("input-streaming"),
    input: v.optional(agentJsonValueSchema),
  }),
  v.strictObject({
    ...agentUiToolPartBase,
    state: v.literal("input-available"),
    input: agentJsonValueSchema,
  }),
  v.strictObject({
    ...agentUiToolPartBase,
    state: v.literal("output-available"),
    input: agentJsonValueSchema,
    output: agentJsonValueSchema,
    approval: v.optional(agentUiToolApprovedSchema),
  }),
  v.strictObject({
    ...agentUiToolPartBase,
    state: v.literal("output-denied"),
    input: agentJsonValueSchema,
    approval: agentUiToolDeniedApprovalSchema,
  }),
  v.strictObject({
    ...agentUiToolPartBase,
    state: v.literal("output-error"),
    input: v.optional(agentJsonValueSchema),
    errorText: v.pipe(v.string(), v.maxLength(2_000)),
    approval: v.optional(agentUiToolApprovedSchema),
  }),
  v.strictObject({
    ...agentUiToolPartBase,
    state: v.literal("approval-requested"),
    input: agentJsonValueSchema,
    approval: agentUiToolApprovalRequestSchema,
  }),
  v.strictObject({
    ...agentUiToolPartBase,
    state: v.literal("approval-responded"),
    input: agentJsonValueSchema,
    approval: agentUiToolApprovalResponseSchema,
  }),
  v.strictObject({
    type: v.literal("data-agent-assets"),
    data: v.strictObject({
      assetIds: v.pipe(
        v.array(agentIdentifierSchema),
        v.minLength(1),
        v.maxLength(4),
        v.checkItems((item, index, array) => array.indexOf(item) === index)
      ),
    }),
  }),
  v.strictObject({
    type: v.literal("data-context-reference"),
    data: v.variant("kind", [
      v.strictObject({
        kind: v.literal("issue"),
        id: agentIdentifierSchema,
        label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      }),
      v.strictObject({
        kind: v.picklist(["file", "member"]),
        id: agentIdentifierSchema,
        label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      }),
      v.strictObject({
        kind: v.literal("current_page"),
        path: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
        label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      }),
    ]),
  }),
  v.strictObject({
    type: v.literal("reasoning"),
    text: v.pipe(v.string(), v.maxLength(50_000)),
    state: v.optional(v.picklist(["streaming", "done"])),
  }),
  v.strictObject({
    type: v.literal("text"),
    text: v.pipe(v.string(), v.maxLength(50_000)),
  }),
  v.strictObject({
    type: v.literal("source-url"),
    sourceId: agentProviderOpaqueIdSchema,
    url: v.pipe(v.string(), v.url(), v.maxLength(2_048)),
    title: v.optional(v.pipe(v.string(), v.maxLength(500))),
  }),
  v.strictObject({ type: v.literal("step-start") }),
])

export const agentUiMessageSchema = v.pipe(
  v.strictObject({
    id: agentIdentifierSchema,
    role: v.picklist(["user", "assistant"]),
    parts: v.pipe(
      v.array(agentUiMessagePartSchema),
      v.minLength(1),
      v.maxLength(64)
    ),
  }),
  v.check(
    (message) => JSON.stringify(message).length <= 131_072,
    "Agent UI message is too large"
  ),
  v.check((message) => {
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
  }, "Invalid parts for Agent UI message role")
)
export const agentUiMessageListSchema = v.array(agentUiMessageSchema)

export type AgentUiMessage = v.InferOutput<typeof agentUiMessageSchema>
export type AgentUiMessagePart = v.InferOutput<typeof agentUiMessagePartSchema>
