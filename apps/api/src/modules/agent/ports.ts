import type {
  AgentActionExecutionResult,
  AgentApprovalPolicy,
  AgentUiMessage,
  AgentClientToolResult,
  AgentContentSegment,
  AgentIssueAction,
  AgentReusableAsset,
  AgentResolvedContextReference,
  AgentResumeTicket,
} from "../../agent-client"

type AgentThreadPermissionMode = "ask_always" | "full_access"

type AgentThreadDto = {
  createdAt: string
  id: string
  status: "active" | "archived"
  title: string
  updatedAt: string
}

type AgentPreparedChat = {
  assetIds: string[]
  clientMessageId: string
  contextReferences: AgentResolvedContextReference[]
  messages: AgentUiMessage[]
  reusableAssets: AgentReusableAsset[]
  threadId: string
  ticket: string
  timezone: string
  trigger: "client_tool_result" | "user_message"
}

type AgentUsageTotal = {
  costMicros: number
  inputTokenCount: number
  outputTokenCount: number
  reasoningTokenCount: number
  runCount: number
  totalTokenCount: number
}

type AgentMonthlyUsage = {
  byModel: Array<
    AgentUsageTotal & {
      model: string
      provider: string
    }
  >
  month: string
  totals: AgentUsageTotal
}

type AgentOrganizationUsage = {
  month: string
  rows: Array<
    AgentUsageTotal & {
      model: string
      provider: string
      userId: string
    }
  >
}

export type AgentServicePorts = {
  cancelAgentRunForSession(input: {
    runId: string
    sessionId: string
    threadId: string
    userId: string
  }): Promise<{
    runId: string
    status:
      | "running"
      | "waiting_approval"
      | "completed"
      | "failed"
      | "canceled"
      | "expired"
  }>
  archiveAgentThreadForSession(input: {
    sessionId: string
    threadId: string
    userId: string
  }): Promise<AgentThreadDto>
  createAgentThreadForSession(input: {
    permissionMode: AgentThreadPermissionMode
    sessionId: string
    title: string
    userId: string
  }): Promise<AgentThreadDto>
  decideAgentActionForSession(input: {
    actionId: string
    decision: "yes" | "no"
    idempotencyKey: string
    sessionId: string
    userId: string
  }): Promise<AgentIssueAction>
  fetchAgentRuntime(request: Request): Promise<Response>
  getAgentActionForSession(input: {
    actionId: string
    sessionId: string
    userId: string
  }): Promise<AgentIssueAction>
  getAgentApprovalPolicyForSession(input: {
    sessionId: string
    threadId: string
    userId: string
  }): Promise<AgentApprovalPolicy>
  getAgentMonthlyUsageForSession(input: {
    month?: string
    sessionId: string
    userId: string
  }): Promise<AgentMonthlyUsage>
  getAgentOrganizationUsageForSession(input: {
    month?: string
    sessionId: string
    userId: string
  }): Promise<AgentOrganizationUsage>
  issueAgentConnectionTicket(input: {
    sessionId: string
    threadId: string
    userId: string
  }): Promise<{ ticket: string; expiresAt: string }>
  listAgentThreadsForSession(input: {
    sessionId: string
    userId: string
  }): Promise<AgentThreadDto[]>
  prepareAgentActionResumeForSession(input: {
    actionId: string
    sessionId: string
    userId: string
  }): Promise<
    | { kind: "receipt"; result: AgentActionExecutionResult }
    | { kind: "ticket"; resume: AgentResumeTicket }
  >
  prepareAgentChatForSession(input: {
    assetIds: string[]
    contentSegments: AgentContentSegment[]
    messageId: string
    sessionId: string
    threadId: string
    timezone: string
    userId: string
  }): Promise<AgentPreparedChat>
  prepareAgentClientToolContinuationForSession(input: {
    assistantMessageId: string
    clientToolResults: AgentClientToolResult[]
    sessionId: string
    threadId: string
    timezone: string
    userId: string
  }): Promise<AgentPreparedChat>
  putAgentApprovalPolicyForSession(input: {
    mode: AgentThreadPermissionMode
    sessionId: string
    threadId: string
    userId: string
  }): Promise<AgentApprovalPolicy>
  revokeCurrentAgentContext(input: {
    sessionId: string
    userId: string
  }): Promise<{ contextEpoch: number }>
}
