import type {
  AgentActionExecutionResult,
  AgentChatRun,
  AgentConnection,
  AgentCreateIssueActionInput,
  AgentDeleteIssueActionInput,
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
  AgentAccountContext,
} from "@enterprise-agentic-saas/agent-contracts"

type AgentGrantInput = { grant: string }

export type AgentInternalPorts = {
  assertRunLive(input: AgentGrantInput): Promise<AgentRunLiveness>
  authorizeWebSearch(input: {
    grant: string
    operationId: string
    query: string
  }): Promise<AgentWebSearchAuthorization>
  consumeConnectionTicket(input: {
    threadId: string
    ticket: string
  }): Promise<AgentConnection>
  executeApprovedAction(input: {
    actionId: string
    grant: string
  }): Promise<AgentActionExecutionResult>
  finalizeRun(input: {
    grant: string
    outcome: "canceled" | "completed" | "failed" | "waiting_approval"
    usage?: AgentUsageRecordInput
  }): Promise<AgentRunResult>
  getAgentImageForModel(input: {
    assetId: string
    grant: string
  }): Promise<Response>
  getIssue(input: AgentSearchIssueInput): Promise<AgentIssueDetail>
  getIssueAttachmentImageForModel(input: {
    fileId: string
    grant: string
    issueId: string
  }): Promise<Response>
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
  startChatRun(input: {
    assetIds: string[]
    clientMessageId: string
    estimatedInputTokenCount: number
    ticket: string
    threadId: string
    trigger: "client_tool_result" | "user_message"
  }): Promise<AgentChatRun>
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
