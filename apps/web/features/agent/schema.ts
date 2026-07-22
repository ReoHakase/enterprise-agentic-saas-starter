import * as v from "valibot"

const timestamp = v.pipe(v.string(), v.isoTimestamp())
const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(128))

export const agentThreadSchema = v.object({
  id: identifier,
  title: v.string(),
  status: v.picklist(["active", "archived"]),
  createdAt: timestamp,
  updatedAt: timestamp,
})
export const agentThreadListSchema = v.array(agentThreadSchema)
export const agentConnectionTicketSchema = v.object({
  ticket: v.string(),
  expiresAt: timestamp,
})
const actionValueSchema = v.union([v.string(), v.array(v.string()), v.null()])
export const agentIssueActionSchema = v.object({
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
  approvalMode: v.nullable(v.picklist(["manual", "auto_policy"])),
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
  expiresAt: timestamp,
  completedAt: v.nullable(timestamp),
})
export const agentApprovalPolicySchema = v.object({
  mode: v.picklist(["ask_each", "auto_write", "auto_all"]),
  expiresAt: v.nullable(timestamp),
  permissions: v.object({
    createIssue: v.boolean(),
    updateIssue: v.boolean(),
    deleteIssue: v.boolean(),
  }),
})
export const agentResumeTicketSchema = agentConnectionTicketSchema
export const agentContextRevocationSchema = v.object({
  contextEpoch: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export const pendingActionToolOutputSchema = v.object({
  status: v.literal("pending"),
  actionId: identifier,
})

export type AgentThread = v.InferOutput<typeof agentThreadSchema>
export type AgentIssueAction = v.InferOutput<typeof agentIssueActionSchema>
export type AgentApprovalPolicy = v.InferOutput<
  typeof agentApprovalPolicySchema
>

export const parseAgentThreads = (value: unknown) =>
  v.parse(agentThreadListSchema, value)
export const parseAgentThread = (value: unknown) =>
  v.parse(agentThreadSchema, value)
export const parseAgentConnectionTicket = (value: unknown) =>
  v.parse(agentConnectionTicketSchema, value)
export const parseAgentIssueAction = (value: unknown) =>
  v.parse(agentIssueActionSchema, value)
export const parseAgentApprovalPolicy = (value: unknown) =>
  v.parse(agentApprovalPolicySchema, value)
export const parseAgentResumeTicket = (value: unknown) =>
  v.parse(agentResumeTicketSchema, value)
export const parseAgentContextRevocation = (value: unknown) =>
  v.parse(agentContextRevocationSchema, value)
