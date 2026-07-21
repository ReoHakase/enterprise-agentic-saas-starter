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
}
