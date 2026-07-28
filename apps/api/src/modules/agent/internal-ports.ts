import type {
  AgentActionExecutionResult,
  AgentConnection,
  AgentCreateIssueActionInput,
  AgentDeleteIssueActionInput,
  AgentGuardedWebSearchQuery,
  AgentIssue,
  AgentIssueAction,
  AgentIssueDetail,
  AgentIssueLabel,
  AgentMember,
  AgentMemoryCommitSettlement,
  AgentMemoryCommitSettlementInput,
  AgentOrganizationContext,
  AgentRunGrant,
  AgentRunResult,
  AgentSearchIssuesInput,
  AgentUpdateIssueActionInput,
  AgentUsageRecordInput,
  AgentUsageRecordResult,
  AgentWebSearchReservation,
  AgentAccountContext,
} from "../../agent-client"

type AgentGrantInput = { grant: string }

export type AgentInternalPorts = {
  settleMemoryCommit(
    input: AgentMemoryCommitSettlementInput
  ): Promise<AgentMemoryCommitSettlement>
  cancelRun(input: AgentGrantInput): Promise<AgentRunResult>
  consumeConnectionTicket(input: {
    threadId: string
    ticket: string
  }): Promise<AgentConnection>
  executeApprovedAction(input: {
    actionId: string
    grant: string
  }): Promise<AgentActionExecutionResult>
  finishRun(input: {
    grant: string
    outcome: "completed" | "failed"
  }): Promise<AgentRunResult>
  getAgentImageForModel(input: {
    assetId: string
    grant: string
  }): Promise<Response>
  getIssue(input: AgentSearchIssueInput): Promise<AgentIssueDetail>
  getIssueActionDecision(input: {
    actionId: string
    grant: string
  }): Promise<AgentIssueAction>
  getIssueAttachmentImageForModel(input: {
    fileId: string
    grant: string
    issueId: string
  }): Promise<Response>
  guardWebSearch(input: {
    grant: string
    query: string
  }): Promise<AgentGuardedWebSearchQuery>
  prepareCreateIssue(
    input: AgentPrepareActionInput<AgentCreateIssueActionInput>
  ): Promise<AgentIssueAction>
  prepareDeleteIssue(
    input: AgentPrepareActionInput<AgentDeleteIssueActionInput>
  ): Promise<AgentIssueAction>
  prepareUpdateIssue(
    input: AgentPrepareActionInput<AgentUpdateIssueActionInput>
  ): Promise<AgentIssueAction>
  readAccountContext(input: AgentGrantInput): Promise<AgentAccountContext>
  readActiveOrganization(
    input: AgentGrantInput
  ): Promise<AgentOrganizationContext>
  recordUsage(
    input: AgentUsageRecordInput & AgentGrantInput
  ): Promise<AgentUsageRecordResult>
  reserveWebSearch(input: {
    grant: string
    operationId: string
  }): Promise<AgentWebSearchReservation>
  resumeApprovedAction(input: {
    actionId: string
    resumeTicket: string
  }): Promise<AgentRunGrant>
  searchIssueLabels(input: {
    grant: string
    limit: number
    query: string
  }): Promise<AgentIssueLabel[]>
  searchIssues(input: AgentSearchIssuesInput): Promise<AgentIssue[]>
  searchOrganizationMembers(input: {
    grant: string
    limit: number
    query: string
  }): Promise<AgentMember[]>
  startRun(input: {
    assetIds: string[]
    clientMessageId: string
    estimatedInputTokenCount: number
    grant: string
    trigger: "client_tool_result" | "user_message"
  }): Promise<AgentRunGrant>
}

type AgentPrepareActionInput<TIssue> = {
  grant: string
  idempotencyKey: string
  issue: TIssue
  toolCallId: string
}

type AgentSearchIssueInput =
  | {
      attachmentCursor?: string
      attachmentLimit?: number
      grant: string
      id: string
      lookup: "id"
    }
  | {
      attachmentCursor?: string
      attachmentLimit?: number
      grant: string
      lookup: "number"
      number: number
    }
