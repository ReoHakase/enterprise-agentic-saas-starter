import type * as v from "valibot"

import type {
  agentAccountContextSchema,
  agentActionExecutionResultSchema,
  agentApprovalPolicySchema,
  agentAttachmentMutationReceiptSchema,
  agentChatRunSchema,
  agentConnectionSchema,
  agentContextRevocationSchema,
  agentCreateIssueActionInputSchema,
  agentDeleteIssueActionInputSchema,
  agentGetIssueInputSchema,
  agentIssueActionKindSchema,
  agentIssueActionPreviewSchema,
  agentIssueActionSchema,
  agentIssueAttachmentSchema,
  agentIssueDetailSchema,
  agentIssueLabelSchema,
  agentIssueSchema,
  agentMemberSchema,
  agentOrganizationContextSchema,
  agentResumeTicketSchema,
  agentRunGrantSchema,
  agentRunLivenessSchema,
  agentRunResultSchema,
  agentSearchIssuesInputSchema,
  agentUpdateIssueActionInputSchema,
  agentUsageRecordInputSchema,
  agentWebSearchAuthorizationSchema,
  getIssueToolInputSchema,
} from "./schemas"

export type AgentAccountContext = v.InferOutput<
  typeof agentAccountContextSchema
>
export type AgentOrganizationContext = v.InferOutput<
  typeof agentOrganizationContextSchema
>
export type AgentMember = v.InferOutput<typeof agentMemberSchema>
export type AgentIssueLabel = v.InferOutput<typeof agentIssueLabelSchema>
export type AgentIssue = v.InferOutput<typeof agentIssueSchema>
export type AgentIssueAttachment = v.InferOutput<
  typeof agentIssueAttachmentSchema
>
export type AgentIssueDetail = v.InferOutput<typeof agentIssueDetailSchema>
export type GetIssueToolInput = v.InferOutput<typeof getIssueToolInputSchema>
export type AgentAttachmentMutationReceipt = v.InferOutput<
  typeof agentAttachmentMutationReceiptSchema
>
export type AgentConnection = v.InferOutput<typeof agentConnectionSchema>
export type AgentChatRun = v.InferOutput<typeof agentChatRunSchema>
export type AgentContextRevocation = v.InferOutput<
  typeof agentContextRevocationSchema
>
export type AgentRunGrant = v.InferOutput<typeof agentRunGrantSchema>
export type AgentRunLiveness = v.InferOutput<typeof agentRunLivenessSchema>
export type AgentRunResult = v.InferOutput<typeof agentRunResultSchema>
export type AgentWebSearchAuthorization = v.InferOutput<
  typeof agentWebSearchAuthorizationSchema
>
export type AgentUsageRecordInput = v.InferOutput<
  typeof agentUsageRecordInputSchema
>
export type AgentIssueActionKind = v.InferOutput<
  typeof agentIssueActionKindSchema
>
export type AgentCreateIssueActionInput = v.InferOutput<
  typeof agentCreateIssueActionInputSchema
>
export type AgentUpdateIssueActionInput = v.InferOutput<
  typeof agentUpdateIssueActionInputSchema
>
export type AgentDeleteIssueActionInput = v.InferOutput<
  typeof agentDeleteIssueActionInputSchema
>
export type AgentIssueActionPreview = v.InferOutput<
  typeof agentIssueActionPreviewSchema
>
export type AgentIssueAction = v.InferOutput<typeof agentIssueActionSchema>
export type AgentActionExecutionResult = v.InferOutput<
  typeof agentActionExecutionResultSchema
>
export type AgentApprovalPolicy = v.InferOutput<
  typeof agentApprovalPolicySchema
>
export type AgentResumeTicket = v.InferOutput<typeof agentResumeTicketSchema>
export type AgentSearchIssuesInput = v.InferOutput<
  typeof agentSearchIssuesInputSchema
>
export type AgentGetIssueInput = v.InferOutput<typeof agentGetIssueInputSchema>
