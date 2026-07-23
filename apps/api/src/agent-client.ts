import { treaty, type Treaty } from "@elysia/eden"

import type { AgentInternalApp } from "./modules/agent/internal-api"

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

export type AgentIssueAttachment = {
  id: string
  filename: string
  sizeBytes: number
  declaredContentType: string
  imageReadable: boolean
  textPreviewable: boolean
  dimensions: { width: number; height: number } | null
  uploaderName: string
  createdAt: string
}

export type AgentIssueDetail = AgentIssue & {
  attachments: {
    items: AgentIssueAttachment[]
    nextCursor: string | null
  }
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
  attempt: number
  grant: string
  expiresAt: string
  shouldGenerateTitle: boolean
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

export type AgentThreadRenameResult = {
  threadId: string
  title: string
  renamed: boolean
}

export type AgentWebSearchReservation = {
  reserved: true
  reused: boolean
}

export type AgentGuardedWebSearchQuery = {
  query: string
}

export type AgentUsageRecordInput = {
  provider: "openrouter"
  model: string
  inputTokenCount: number
  inputNoCacheTokenCount: number
  cacheReadTokenCount: number
  cacheWriteTokenCount: number
  outputTokenCount: number
  textOutputTokenCount: number
  reasoningTokenCount: number
  totalTokenCount: number
  imageInputCount: number
  providerCostMicros?: number
  durationMs: number
  runEventId: string
}

export type AgentUsageRecordResult = {
  recorded: boolean
  calculatedCostMicros: number
  pricingVersion: string
}

export type AgentCanonicalJsonValue =
  | boolean
  | null
  | number
  | string
  | AgentCanonicalJsonValue[]
  | { [key: string]: AgentCanonicalJsonValue }

export type AgentCanonicalToolName =
  | "create_issue"
  | "delete_issue"
  | "get_issue"
  | "read_issue_attachment_image"
  | "read_account_context"
  | "read_active_organization"
  | "rename_thread"
  | "search_issue_labels"
  | "search_issues"
  | "search_organization_members"
  | "ui_navigate"
  | "ui_open_issue"
  | "ui_patch_form_draft"
  | "ui_read_form_draft"
  | "ui_set_issue_query"
  | "update_issue"
  | "web_search"

export type AgentCanonicalToolPart = {
  type: `tool-${AgentCanonicalToolName}`
  toolCallId: string
  state:
    | "input-available"
    | "output-available"
    | "output-denied"
    | "output-error"
  input?: AgentCanonicalJsonValue
  output?: AgentCanonicalJsonValue
  errorText?: string
}

export type AgentCanonicalMessagePart =
  | { type: "text"; text: string }
  | { type: "data-agent-assets"; data: { assetIds: string[] } }
  | {
      type: "data-context-reference"
      data: AgentCanonicalContextReference
    }
  | {
      type: "data-activity"
      data: {
        kind: "status" | "tool"
        status: "running" | "completed" | "failed"
        label: string
      }
    }
  | {
      type: "data-context-budget"
      data: AgentContextBudget
    }
  | {
      type: "data-thread-title"
      data: AgentThreadRenameResult
    }
  | { type: "reasoning"; text: string }
  | {
      type: "source-url"
      sourceId: string
      url: string
      title?: string
    }
  | { type: "step-start" }
  | AgentCanonicalToolPart

export type AgentContextBudget = {
  contextWindowTokens: number
  reservedOutputTokens: number
  estimated: {
    system: number
    skills: number
    tools: number
    history: number
    pageContext: number
    attachments: number
    total: number
  }
  observedInputTokens: number | null
  level: "normal" | "notice" | "warning" | "critical"
}

export type AgentCanonicalMessage = {
  id: string
  role: "user" | "assistant"
  parts: AgentCanonicalMessagePart[]
}

export type AgentRuntimeChatInput = {
  ticket: string
  threadId: string
  clientMessageId: string
  messages: AgentCanonicalMessage[]
  assetIds: string[]
  contextReferences: AgentResolvedContextReference[]
  timezone: string
  trigger: "user_message" | "client_tool_result"
}

export type AgentResolvedContextReference =
  | {
      kind: "issue"
      id: string
      number: number
      title: string
      description: string
      status: AgentIssue["status"]
      priority: AgentIssue["priority"]
    }
  | { kind: "file"; id: string; filename: string }
  | { kind: "member"; id: string; name: string; role: AgentMember["role"] }
  | { kind: "current_page"; path: string; title: string }

export type AgentContextReferenceInput =
  | {
      kind: "issue" | "file" | "member"
      id: string
    }
  | { kind: "current_page"; path: string }

export type AgentContentSegment =
  | { type: "text"; text: string }
  | { type: "context_reference"; reference: AgentContextReferenceInput }

export type AgentCanonicalContextReference =
  | {
      kind: "issue" | "file" | "member"
      id: string
      label: string
    }
  | { kind: "current_page"; path: string; label: string }

export type AgentRuntimeResumeInput = {
  actionId: string
  resumeTicket: string
}

export type AgentClientToolName =
  | "ui_navigate"
  | "ui_open_issue"
  | "ui_patch_form_draft"
  | "ui_read_form_draft"
  | "ui_set_issue_query"

export type AgentClientToolResult = {
  toolCallId: string
  toolName: AgentClientToolName
} & (
  | {
      state: "output-available"
      output: AgentCanonicalJsonValue
    }
  | {
      state: "output-error"
      errorText: string
    }
)

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
  approvalMode: "manual" | "full_access" | null
  requiresApproval: boolean
  preview: AgentIssueActionPreview | null
  previewState: "available" | "expired"
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
  mode: "ask_always" | "full_access"
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

export type AgentGetIssueInput =
  | {
      grant: string
      lookup: "id"
      id: string
      attachmentCursor?: string
      attachmentLimit?: number
    }
  | {
      grant: string
      lookup: "number"
      number: number
      attachmentCursor?: string
      attachmentLimit?: number
    }

export type AgentInternalFetchBinding = {
  fetch(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): ReturnType<typeof fetch>
}

/**
 * server-only private Service Binding client. Browserへ公開するpublic API clientと
 * 同じentry pointへ再exportせず、Agent Workerだけがこのfactoryを利用する。
 */
export const createAgentInternalClient = (
  binding: AgentInternalFetchBinding
): Treaty.Create<AgentInternalApp> => {
  const serviceBindingFetch: typeof fetch = Object.assign(
    (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      // Cloudflareのfetch-only Service Binding契約へ、header/body/signalを
      // まとめた単一Requestとして渡す。
      const request =
        input instanceof Request
          ? init === undefined
            ? input
            : new Request(input, init)
          : new Request(input, init)
      return binding.fetch(request)
    },
    {
      // Bunの型だけが要求するhint。Eden/Service Binding transportでは未使用。
      preconnect: () => undefined,
    }
  )
  return treaty<AgentInternalApp>("https://agent-internal.invalid", {
    fetcher: serviceBindingFetch,
    // Internal DTOもpublic clientと同じJSON契約を保ち、ISO timestampを
    // 実行時だけDateへ変換しない。
    parseDate: false,
  })
}

export type AgentInternalClient = ReturnType<typeof createAgentInternalClient>
