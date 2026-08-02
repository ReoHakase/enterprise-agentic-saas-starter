import {
  agentAttachmentMutationReceiptSchema,
  agentUiMessageListSchema,
  type agentUiToolNames,
} from "@enterprise-agentic-saas/api/client"
import type { UIMessage } from "ai"
import * as v from "valibot"

const timestamp = v.pipe(v.string(), v.isoTimestamp())
const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(128))
const agentRunResultSchema = v.strictObject({
  runId: identifier,
  status: v.picklist([
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "canceled",
    "expired",
  ]),
})

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
  { runId?: string },
  {
    "agent-assets": AgentChatAssetData
    "context-reference":
      | { kind: "issue" | "file" | "member"; id: string; label: string }
      | { kind: "current_page"; path: string; label: string }
    run: { runId: string }
  },
  {
    [Name in (typeof agentUiToolNames)[number]]: {
      input: unknown
      output: unknown
    }
  }
>

export const parseAgentRunResult = (value: unknown) =>
  v.parse(agentRunResultSchema, value)

const agentThreadSchema = v.object({
  id: identifier,
  title: v.string(),
  status: v.picklist(["active", "archived"]),
  createdAt: timestamp,
  updatedAt: timestamp,
})
const agentThreadListSchema = v.array(agentThreadSchema)
const actionValueSchema = v.union([v.string(), v.array(v.string()), v.null()])
const actionPreviewAttachmentSchema = v.variant("source", [
  v.object({
    source: v.literal("asset"),
    assetId: identifier,
    filename: v.string(),
    sizeBytes: v.number(),
  }),
  v.object({
    source: v.literal("file"),
    fileId: identifier,
    filename: v.string(),
    sizeBytes: v.number(),
  }),
])
const actionPreviewSchema = v.object({
  kind: v.picklist(["create_issue", "update_issue", "delete_issue"]),
  destructive: v.boolean(),
  attachmentOperation: v.nullable(v.picklist(["add", "remove"])),
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
  attachments: v.array(actionPreviewAttachmentSchema),
})
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
  preview: v.nullable(actionPreviewSchema),
  previewState: v.picklist(["available", "expired"]),
  expiresAt: timestamp,
  completedAt: v.nullable(timestamp),
})
const uniqueAddedFileIds = v.pipe(
  v.array(identifier),
  v.minLength(1),
  v.maxLength(4),
  v.checkItems((item, index, array) => array.indexOf(item) === index)
)
const uniqueRemovedFileIds = v.pipe(
  v.array(identifier),
  v.minLength(1),
  v.maxLength(20),
  v.checkItems((item, index, array) => array.indexOf(item) === index)
)
const attachmentMutationSchema = v.variant("operation", [
  v.object({
    operation: v.literal("added"),
    fileIds: uniqueAddedFileIds,
  }),
  v.object({
    operation: v.literal("removed"),
    fileIds: uniqueRemovedFileIds,
  }),
])
const agentActionExecutionResultSchema = v.object({
  actionId: identifier,
  kind: v.picklist(["create_issue", "update_issue", "delete_issue"]),
  status: v.literal("succeeded"),
  issue: v.object({
    id: identifier,
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    deleted: v.boolean(),
    attachmentMutation: v.optional(attachmentMutationSchema),
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
export const pendingActionToolOutputSchema = v.object({
  status: v.literal("pending"),
  actionId: identifier,
})
export const attachmentMutationToolReceiptSchema =
  agentAttachmentMutationReceiptSchema

export type AgentThread = v.InferOutput<typeof agentThreadSchema>
export type AgentIssueAction = v.InferOutput<typeof agentIssueActionSchema>

export const parseAgentThreads = (value: unknown) =>
  v.parse(agentThreadListSchema, value)
const parseAgentMessages = (value: unknown): AgentChatMessage[] => {
  const messages: AgentChatMessage[] = JSON.parse(
    JSON.stringify(v.parse(agentUiMessageListSchema, value))
  )
  return messages
}
const agentMessagePageSchema = v.object({
  messages: agentUiMessageListSchema,
  total: v.pipe(v.number(), v.integer(), v.minValue(0)),
  page: v.pipe(v.number(), v.integer(), v.minValue(0)),
  perPage: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  hasMore: v.boolean(),
})
export const parseAgentMessagePage = (value: unknown) => {
  const page = v.parse(agentMessagePageSchema, value)
  return {
    ...page,
    messages: parseAgentMessages(page.messages),
  }
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
