export type AgentAccountContext = {
  name: string
  profileImage: string | null
}

export type AgentOrganizationContext = {
  name: string
  slug: string
  role: "super_admin" | "admin" | "member"
  permissions: {
    canReadIssues: true
    canCreateIssues: true
    canUpdateIssues: true
    canDeleteOwnIssues: true
    canDeleteAnyIssue: boolean
  }
}

export type AgentMember = {
  id: string
  name: string
  profileImage: string | null
  role: "super_admin" | "admin" | "member"
}

export type AgentIssueLabel = {
  label: string
  usageCount: number
}

export type AgentIssue = {
  id: string
  number: number
  title: string
  description: string
  status: "open" | "in_progress" | "closed"
  priority: "no_priority" | "low" | "medium" | "high" | "urgent"
  assigneeId: string | null
  labels: string[]
  dueDate: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export type AgentConnection = {
  grant: string
  expiresAt: string
  user: AgentAccountContext
  organization: AgentOrganizationContext
  thread: { id: string; title: string }
}

export type AgentRunGrant = {
  runId: string
  rootRunId: string
  grant: string
  expiresAt: string
}

export type AgentRunResult = {
  runId: string
  status:
    | "running"
    | "waiting_approval"
    | "completed"
    | "failed"
    | "canceled"
    | "expired"
}

export type AgentIssueActionKind =
  | "create_issue"
  | "update_issue"
  | "delete_issue"

export type AgentCreateIssueActionInput = {
  title: string
  description?: string
  status?: AgentIssue["status"]
  priority?: AgentIssue["priority"]
  assigneeId?: string | null
  labels?: string[]
  dueDate?: string | null
  attachmentAssetIds?: string[]
}

export type AgentUpdateIssueActionInput = {
  issueId: string
  expectedRevision: number
  title?: string
  description?: string
  status?: AgentIssue["status"]
  priority?: AgentIssue["priority"]
  assigneeId?: string | null
  labels?: string[]
  dueDate?: string | null
}

export type AgentDeleteIssueActionInput = {
  issueId: string
  expectedRevision: number
}

export type AgentIssueActionPreview = {
  kind: AgentIssueActionKind
  destructive: boolean
  title: string
  issueNumber: number | null
  issueRevision: number | null
  fields: Array<{
    field:
      | "title"
      | "description"
      | "status"
      | "priority"
      | "assignee"
      | "labels"
      | "due_date"
    before: string | string[] | null
    after: string | string[] | null
  }>
  attachments: Array<{
    assetId: string
    filename: string
    sizeBytes: number
  }>
}

export type AgentIssueAction = {
  id: string
  kind: AgentIssueActionKind
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "expired"
    | "canceled"
    | "succeeded"
    | "conflicted"
  approvalMode: "manual" | "auto_policy" | null
  requiresApproval: boolean
  preview: AgentIssueActionPreview | null
  expiresAt: string
  completedAt: string | null
}

export type AgentActionExecutionResult = {
  actionId: string
  kind: AgentIssueActionKind
  status: "succeeded"
  issue: {
    id: string
    number: number
    revision: number
    deleted: boolean
  }
}

export type AgentApprovalPolicy = {
  mode: "ask_each" | "auto_write" | "auto_all"
  expiresAt: string | null
  permissions: {
    createIssue: boolean
    updateIssue: boolean
    deleteIssue: boolean
  }
}

export type AgentResumeTicket = {
  ticket: string
  expiresAt: string
}

export type AgentSearchIssuesInput = {
  grant: string
  search?: string
  status?: "open" | "in_progress" | "closed"
  priority?: "no_priority" | "low" | "medium" | "high" | "urgent"
  assigneeId?: string
  label?: string
  sortBy?:
    | "number"
    | "createdAt"
    | "updatedAt"
    | "dueDate"
    | "priority"
    | "status"
  sortDirection?: "asc" | "desc"
  /** 安定sortされたbounded first pageだけを返す。継続取得用cursorは未提供。 */
  limit?: number
}

export type AgentInternalApiContract = {
  consumeConnectionTicket(input: {
    ticket: string
    threadId: string
  }): Promise<AgentConnection>
  startRun(input: {
    grant: string
    clientMessageId: string
    assetIds?: string[]
  }): Promise<AgentRunGrant>
  cancelRun(input: { grant: string }): Promise<AgentRunResult>
  finishRun(input: {
    grant: string
    outcome: "completed" | "failed"
  }): Promise<AgentRunResult>
  readAccountContext(input: { grant: string }): Promise<AgentAccountContext>
  readActiveOrganization(input: {
    grant: string
  }): Promise<AgentOrganizationContext>
  searchOrganizationMembers(input: {
    grant: string
    query?: string
    limit?: number
  }): Promise<AgentMember[]>
  searchIssueLabels(input: {
    grant: string
    query?: string
    limit?: number
  }): Promise<AgentIssueLabel[]>
  searchIssues(input: AgentSearchIssuesInput): Promise<AgentIssue[]>
  getIssue(
    input:
      | { grant: string; lookup: "id"; id: string }
      | { grant: string; lookup: "number"; number: number }
  ): Promise<AgentIssue>
  prepareCreateIssue(input: {
    grant: string
    toolCallId: string
    idempotencyKey: string
    issue: AgentCreateIssueActionInput
  }): Promise<AgentIssueAction>
  prepareUpdateIssue(input: {
    grant: string
    toolCallId: string
    idempotencyKey: string
    issue: AgentUpdateIssueActionInput
  }): Promise<AgentIssueAction>
  prepareDeleteIssue(input: {
    grant: string
    toolCallId: string
    idempotencyKey: string
    issue: AgentDeleteIssueActionInput
  }): Promise<AgentIssueAction>
  getIssueActionDecision(input: {
    grant: string
    actionId: string
  }): Promise<AgentIssueAction>
  resumeApprovedAction(input: {
    actionId: string
    resumeTicket: string
  }): Promise<AgentRunGrant>
  executeApprovedAction(input: {
    grant: string
    actionId: string
  }): Promise<AgentActionExecutionResult>
  getAgentImageForModel(input: {
    grant: string
    assetId: string
  }): Promise<Response>
}
