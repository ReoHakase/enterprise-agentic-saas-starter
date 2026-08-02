import * as v from "valibot"

import {
  agentJsonValueSchema,
  agentProviderOpaqueIdSchema,
  agentUiMessageSchema,
} from "./chat"
import {
  agentIdentifierSchema,
  agentIssuePrioritySchema,
  agentIssueStatusSchema,
  agentRoleSchema,
} from "./schemas"

export const AGENT_MODEL_CONTEXT_WINDOW_TOKENS = 1_050_000
export const AGENT_MODEL_RESERVED_OUTPUT_TOKENS = 4_096
export const AGENT_MAX_ESTIMATED_INPUT_TOKENS =
  AGENT_MODEL_CONTEXT_WINDOW_TOKENS - AGENT_MODEL_RESERVED_OUTPUT_TOKENS

const capabilitySchema = v.pipe(
  v.string(),
  v.minLength(32),
  v.maxLength(512),
  v.regex(/^[A-Za-z0-9._~-]+$/)
)

export const agentResolvedContextReferenceSchema = v.variant("kind", [
  v.strictObject({
    kind: v.literal("issue"),
    id: agentIdentifierSchema,
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    title: v.pipe(v.string(), v.maxLength(200)),
    description: v.pipe(v.string(), v.maxLength(50_000)),
    status: agentIssueStatusSchema,
    priority: agentIssuePrioritySchema,
  }),
  v.strictObject({
    kind: v.literal("file"),
    id: agentIdentifierSchema,
    filename: v.pipe(v.string(), v.maxLength(255)),
  }),
  v.strictObject({
    kind: v.literal("member"),
    id: agentIdentifierSchema,
    name: v.pipe(v.string(), v.maxLength(200)),
    role: agentRoleSchema,
  }),
  v.strictObject({
    kind: v.literal("current_page"),
    path: v.pipe(v.string(), v.maxLength(500)),
    title: v.pipe(v.string(), v.maxLength(300)),
  }),
])

export const agentReusableAssetSchema = v.strictObject({
  id: agentIdentifierSchema,
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
})

export const AGENT_RUNTIME_REUSABLE_ASSET_MAX_COUNT = 200

export const agentRuntimeChatInputSchema = v.pipe(
  v.strictObject({
    ticket: capabilitySchema,
    threadId: agentIdentifierSchema,
    clientMessageId: agentIdentifierSchema,
    message: agentUiMessageSchema,
    assetIds: v.pipe(
      v.array(agentIdentifierSchema),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
    reusableAssets: v.optional(
      v.pipe(
        v.array(agentReusableAssetSchema),
        v.maxLength(AGENT_RUNTIME_REUSABLE_ASSET_MAX_COUNT),
        v.checkItems(
          (item, index, array) =>
            array.findIndex(({ id }) => id === item.id) === index
        )
      ),
      []
    ),
    contextReferences: v.pipe(
      v.array(agentResolvedContextReferenceSchema),
      v.maxLength(12)
    ),
    timezone: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
    trigger: v.picklist(["user_message", "client_tool_result"]),
  }),
  v.check(
    (input) =>
      input.reusableAssets.every(({ id }) => !input.assetIds.includes(id)),
    "Invalid reusable agent asset selection"
  )
)

export const agentRuntimeResumeInputSchema = v.strictObject({
  actionId: agentIdentifierSchema,
  resumeTicket: capabilitySchema,
})

export const agentContextReferenceInputSchema = v.variant("kind", [
  v.strictObject({
    kind: v.picklist(["issue", "file", "member"]),
    id: agentIdentifierSchema,
  }),
  v.strictObject({
    kind: v.literal("current_page"),
    path: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  }),
])

export const agentContentSegmentSchema = v.variant("type", [
  v.strictObject({
    type: v.literal("text"),
    text: v.pipe(v.string(), v.maxLength(20_000)),
  }),
  v.strictObject({
    type: v.literal("context_reference"),
    reference: agentContextReferenceInputSchema,
  }),
])

export const agentUiContextReferenceSchema = v.variant("kind", [
  v.strictObject({
    kind: v.picklist(["issue", "file", "member"]),
    id: agentIdentifierSchema,
    label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  }),
  v.strictObject({
    kind: v.literal("current_page"),
    path: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  }),
])

export const agentClientToolNames = [
  "ui_navigate",
  "ui_open_issue",
  "ui_patch_form_draft",
  "ui_read_form_draft",
  "ui_set_issue_query",
] as const
export const agentClientToolNameSchema = v.picklist(agentClientToolNames)

export const agentClientToolResultSchema = v.variant("state", [
  v.strictObject({
    toolCallId: agentProviderOpaqueIdSchema,
    toolName: agentClientToolNameSchema,
    state: v.literal("output-available"),
    input: agentJsonValueSchema,
    output: agentJsonValueSchema,
  }),
  v.strictObject({
    toolCallId: agentProviderOpaqueIdSchema,
    toolName: agentClientToolNameSchema,
    state: v.literal("output-error"),
    input: v.optional(agentJsonValueSchema),
    errorText: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  }),
])

export type AgentRuntimeChatInput = v.InferOutput<
  typeof agentRuntimeChatInputSchema
>
export type AgentResolvedContextReference = v.InferOutput<
  typeof agentResolvedContextReferenceSchema
>
export type AgentReusableAsset = v.InferOutput<typeof agentReusableAssetSchema>
export type AgentRuntimeResumeInput = v.InferOutput<
  typeof agentRuntimeResumeInputSchema
>
export type AgentContextReferenceInput = v.InferOutput<
  typeof agentContextReferenceInputSchema
>
export type AgentContentSegment = v.InferOutput<
  typeof agentContentSegmentSchema
>
export type AgentUiContextReference = v.InferOutput<
  typeof agentUiContextReferenceSchema
>
export type AgentClientToolName = v.InferOutput<
  typeof agentClientToolNameSchema
>
export type AgentClientToolResult = v.InferOutput<
  typeof agentClientToolResultSchema
>
