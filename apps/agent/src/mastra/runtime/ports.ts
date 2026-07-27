import type {
  AgentAccountContext,
  AgentActionExecutionResult,
  AgentConnection,
  AgentCreateIssueActionInput,
  AgentDeleteIssueActionInput,
  AgentGuardedWebSearchQuery,
  AgentGetIssueInput,
  AgentIssue,
  AgentIssueAction,
  AgentIssueDetail,
  AgentIssueLabel,
  AgentMember,
  AgentOrganizationContext,
  AgentRunGrant,
  AgentRunResult,
  AgentSearchIssuesInput,
  AgentUpdateIssueActionInput,
  AgentUsageRecordInput,
  AgentUsageRecordResult,
  AgentWebSearchReservation,
} from "@enterprise-agentic-saas/agent-contracts"

type BearerInput = { grant: string }

export type AgentControlPlanePort = {
  consumeConnectionTicket(input: {
    ticket: string
    threadId: string
  }): Promise<AgentConnection>
  startRun(
    input: BearerInput & {
      clientMessageId: string
      estimatedInputTokenCount?: number
      assetIds?: string[]
      trigger?: "user_message" | "client_tool_result"
    }
  ): Promise<AgentRunGrant>
  reserveWebSearch(
    input: BearerInput & { operationId: string }
  ): Promise<AgentWebSearchReservation>
  guardWebSearch(
    input: BearerInput & { query: string }
  ): Promise<AgentGuardedWebSearchQuery>
  cancelRun(input: BearerInput): Promise<AgentRunResult>
  finishRun(
    input: BearerInput & { outcome: "completed" | "failed" }
  ): Promise<AgentRunResult>
  recordUsage(
    input: BearerInput & AgentUsageRecordInput
  ): Promise<AgentUsageRecordResult>
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
  getIssueActionDecision(
    input: BearerInput & { actionId: string }
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
