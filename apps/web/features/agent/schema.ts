import type { DynamicToolUIPart, UIMessage } from "ai"
import * as v from "valibot"

const timestamp = v.pipe(v.string(), v.isoTimestamp())
const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(128))

type AgentChatAssetData = {
  assetIds: string[]
  assets?: Array<{
    id: string
    filename: string
    sizeBytes: number
    imageWidth: number
    imageHeight: number
    expiresAt: string
  }>
}
export type AgentChatMessage = UIMessage<
  unknown,
  {
    "agent-assets": AgentChatAssetData
    "context-reference":
      | { kind: "issue" | "file" | "member"; id: string; label: string }
      | { kind: "current_page"; path: string; label: string }
    activity: {
      kind: "status" | "tool"
      status: "running" | "completed" | "failed"
      label: string
    }
    "context-budget": {
      contextWindowTokens: number
      reservedOutputTokens: number
      estimated: {
        system: number
        skills: number
        tools: number
        history: number
        pageContext: number
        attachments: number
        total: number
      }
      observedInputTokens: number | null
      level: "normal" | "notice" | "warning" | "critical"
    }
    "thread-title": { threadId: string; title: string; renamed: boolean }
  }
>

const canonicalToolTypes = [
  "tool-create_issue",
  "tool-delete_issue",
  "tool-get_issue",
  "tool-read_issue_attachment_image",
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
const canonicalToolPartSchema = v.object({
  type: v.picklist(canonicalToolTypes),
  toolCallId: identifier,
  state: v.picklist([
    "input-available",
    "output-available",
    "output-denied",
    "output-error",
  ]),
  input: v.optional(v.unknown()),
  output: v.optional(v.unknown()),
  errorText: v.optional(v.string()),
})
const canonicalMessagePartSchema = v.union([
  v.object({ type: v.literal("text"), text: v.string() }),
  v.object({ type: v.literal("reasoning"), text: v.string() }),
  v.object({
    type: v.literal("source-url"),
    sourceId: identifier,
    url: v.string(),
    title: v.optional(v.string()),
  }),
  v.object({ type: v.literal("step-start") }),
  v.object({
    type: v.literal("data-agent-assets"),
    data: v.object({ assetIds: v.array(identifier) }),
  }),
  v.object({
    type: v.literal("data-context-reference"),
    data: v.variant("kind", [
      v.object({
        kind: v.picklist(["issue", "file", "member"]),
        id: identifier,
        label: v.string(),
      }),
      v.object({
        kind: v.literal("current_page"),
        path: v.string(),
        label: v.string(),
      }),
    ]),
  }),
  v.object({
    type: v.literal("data-activity"),
    data: v.object({
      kind: v.picklist(["status", "tool"]),
      status: v.picklist(["running", "completed", "failed"]),
      label: v.string(),
    }),
  }),
  v.object({
    type: v.literal("data-context-budget"),
    data: v.object({
      contextWindowTokens: v.number(),
      reservedOutputTokens: v.number(),
      estimated: v.object({
        system: v.number(),
        skills: v.number(),
        tools: v.number(),
        history: v.number(),
        pageContext: v.number(),
        attachments: v.number(),
        total: v.number(),
      }),
      observedInputTokens: v.nullable(v.number()),
      level: v.picklist(["normal", "notice", "warning", "critical"]),
    }),
  }),
  v.object({
    type: v.literal("data-thread-title"),
    data: v.object({
      threadId: identifier,
      title: v.string(),
      renamed: v.boolean(),
    }),
  }),
  canonicalToolPartSchema,
])
const canonicalMessageSchema = v.object({
  id: identifier,
  role: v.picklist(["user", "assistant"]),
  parts: v.array(canonicalMessagePartSchema),
})
const canonicalMessageListSchema = v.array(canonicalMessageSchema)

type CanonicalToolPart = v.InferOutput<typeof canonicalToolPartSchema>
type CanonicalMessagePart = v.InferOutput<typeof canonicalMessagePartSchema>

const normalizeCanonicalToolPart = (
  part: CanonicalToolPart
): DynamicToolUIPart => {
  const common = {
    type: "dynamic-tool",
    toolName: part.type.slice("tool-".length),
    toolCallId: part.toolCallId,
  } as const

  if (part.state === "output-available") {
    return {
      ...common,
      state: "output-available",
      input: part.input,
      output: part.output,
    }
  }
  if (part.state === "output-error" || part.state === "output-denied") {
    return {
      ...common,
      state: "output-error",
      input: part.input,
      errorText:
        part.errorText ??
        (part.state === "output-denied"
          ? "Tool output was denied."
          : "Tool failed."),
    }
  }
  return {
    ...common,
    state: "input-available",
    input: part.input,
  }
}

const normalizeCanonicalMessagePart = (
  part: CanonicalMessagePart
): AgentChatMessage["parts"][number] => {
  if ("toolCallId" in part) return normalizeCanonicalToolPart(part)
  if (part.type === "data-agent-assets") {
    return {
      type: "data-agent-assets",
      data: { assetIds: part.data.assetIds },
    }
  }
  return part
}

const agentThreadSchema = v.object({
  id: identifier,
  title: v.string(),
  titleRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  status: v.picklist(["active", "archived"]),
  messageCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  createdAt: timestamp,
  updatedAt: timestamp,
})
const agentThreadListSchema = v.array(agentThreadSchema)
const actionValueSchema = v.union([v.string(), v.array(v.string()), v.null()])
const agentIssueActionSchema = v.object({
  id: identifier,
  kind: v.picklist(["create_issue", "update_issue", "delete_issue"]),
  status: v.picklist([
    "pending",
    "approved",
    "rejected",
    "expired",
    "canceled",
    "succeeded",
    "conflicted",
  ]),
  approvalMode: v.nullable(v.picklist(["manual", "full_access"])),
  requiresApproval: v.boolean(),
  preview: v.nullable(
    v.object({
      kind: v.picklist(["create_issue", "update_issue", "delete_issue"]),
      destructive: v.boolean(),
      title: v.string(),
      issueNumber: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
      issueRevision: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
      fields: v.array(
        v.object({
          field: v.picklist([
            "title",
            "description",
            "status",
            "priority",
            "assignee",
            "labels",
            "due_date",
          ]),
          before: actionValueSchema,
          after: actionValueSchema,
        })
      ),
      attachments: v.array(
        v.object({
          assetId: identifier,
          filename: v.string(),
          sizeBytes: v.number(),
        })
      ),
    })
  ),
  previewState: v.picklist(["available", "expired"]),
  expiresAt: timestamp,
  completedAt: v.nullable(timestamp),
})
const agentActionExecutionResultSchema = v.object({
  actionId: identifier,
  kind: v.picklist(["create_issue", "update_issue", "delete_issue"]),
  status: v.literal("succeeded"),
  issue: v.object({
    id: identifier,
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    deleted: v.boolean(),
  }),
})
const agentApprovalPolicySchema = v.object({
  mode: v.picklist(["ask_always", "full_access"]),
  permissions: v.object({
    createIssue: v.boolean(),
    updateIssue: v.boolean(),
    deleteIssue: v.boolean(),
  }),
})
const agentContextRevocationSchema = v.object({
  contextEpoch: v.pipe(v.number(), v.integer(), v.minValue(1)),
})
const agentThreadContextSchema = v.object({
  threadId: identifier,
  messageCount: v.number(),
  estimatedHistoryTokens: v.number(),
  latestSummaryThroughSequence: v.nullable(v.number()),
  latestSummaryEstimatedTokens: v.nullable(v.number()),
})
export const pendingActionToolOutputSchema = v.object({
  status: v.literal("pending"),
  actionId: identifier,
})

export type AgentThread = v.InferOutput<typeof agentThreadSchema>
export type AgentIssueAction = v.InferOutput<typeof agentIssueActionSchema>
export type AgentThreadContext = v.InferOutput<typeof agentThreadContextSchema>

export const parseAgentThreads = (value: unknown) =>
  v.parse(agentThreadListSchema, value)
export const parseAgentMessages = (value: unknown): AgentChatMessage[] => {
  const messages: AgentChatMessage[] = []
  for (const message of v.parse(canonicalMessageListSchema, value)) {
    messages.push({
      id: message.id,
      role: message.role,
      parts: message.parts.map(normalizeCanonicalMessagePart),
    })
  }
  return messages
}
export const parseAgentThread = (value: unknown) =>
  v.parse(agentThreadSchema, value)
export const parseAgentIssueAction = (value: unknown) =>
  v.parse(agentIssueActionSchema, value)
export const parseAgentActionExecutionResult = (value: unknown) =>
  v.parse(agentActionExecutionResultSchema, value)
export const parseAgentApprovalPolicy = (value: unknown) =>
  v.parse(agentApprovalPolicySchema, value)
export const parseAgentContextRevocation = (value: unknown) =>
  v.parse(agentContextRevocationSchema, value)
export const parseAgentThreadContext = (value: unknown) =>
  v.parse(agentThreadContextSchema, value)
