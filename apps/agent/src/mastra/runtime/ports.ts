import type {
  AgentAccountContext,
  AgentActionExecutionResult,
  AgentChatRun,
  AgentConnection,
  AgentCreateIssueActionInput,
  AgentDeleteIssueActionInput,
  AgentGetIssueInput,
  AgentIssue,
  AgentIssueAction,
  AgentIssueDetail,
  AgentIssueLabel,
  AgentMember,
  AgentOrganizationContext,
  AgentRunGrant,
  AgentRunLiveness,
  AgentRunResult,
  AgentSearchIssuesInput,
  AgentUpdateIssueActionInput,
  AgentUsageRecordInput,
  AgentWebSearchAuthorization,
} from "@enterprise-agentic-saas/agent-contracts"

type BearerInput = { grant: string }

export type AgentControlPlanePort = {
  consumeConnectionTicket(input: {
    ticket: string
    threadId: string
  }): Promise<AgentConnection>
  startChatRun(input: {
    ticket: string
    threadId: string
    clientMessageId: string
    estimatedInputTokenCount?: number
    assetIds?: string[]
    trigger?: "user_message" | "client_tool_result"
  }): Promise<AgentChatRun>
  assertRunLive(input: BearerInput): Promise<AgentRunLiveness>
  authorizeWebSearch(
    input: BearerInput & { operationId: string; query: string }
  ): Promise<AgentWebSearchAuthorization>
  finalizeRun(
    input: BearerInput & {
      outcome: "canceled" | "completed" | "failed" | "waiting_approval"
      usage?: AgentUsageRecordInput
    }
  ): Promise<AgentRunResult>
  readAccountContext(input: BearerInput): Promise<AgentAccountContext>
  readActiveOrganization(input: BearerInput): Promise<AgentOrganizationContext>
  searchOrganizationMembers(
    input: BearerInput & { query?: string; limit?: number }
  ): Promise<AgentMember[]>
  searchIssueLabels(
    input: BearerInput & { query?: string; limit?: number }
  ): Promise<AgentIssueLabel[]>
  searchIssues(input: AgentSearchIssuesInput): Promise<AgentIssue[]>
  getIssue(input: AgentGetIssueInput): Promise<AgentIssueDetail>
  prepareCreateIssue(
    input: BearerInput & {
      toolCallId: string
      idempotencyKey: string
      issue: AgentCreateIssueActionInput
    }
  ): Promise<AgentIssueAction>
  prepareUpdateIssue(
    input: BearerInput & {
      toolCallId: string
      idempotencyKey: string
      issue: AgentUpdateIssueActionInput
    }
  ): Promise<AgentIssueAction>
  prepareDeleteIssue(
    input: BearerInput & {
      toolCallId: string
      idempotencyKey: string
      issue: AgentDeleteIssueActionInput
    }
  ): Promise<AgentIssueAction>
  resumeApprovedAction(input: {
    actionId: string
    resumeTicket: string
  }): Promise<AgentRunGrant>
  executeApprovedAction(
    input: BearerInput & { actionId: string }
  ): Promise<AgentActionExecutionResult>
  getAgentImageForModel(
    input: BearerInput & { assetId: string }
  ): Promise<Response>
  getIssueAttachmentImageForModel(
    input: BearerInput & { issueId: string; fileId: string }
  ): Promise<Response>
}

export type AgentControlFailure = {
  body: string
  retryAfter: number | null
  status: 409 | 429
}
