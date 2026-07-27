import type {
  AgentIssue,
  AgentMember,
  AgentThreadRenameResult,
} from "./schemas"

export * from "./schemas"
export type {
  AgentAccountContext,
  AgentActionExecutionResult,
  AgentAttachmentMutationReceipt,
  AgentApprovalPolicy,
  AgentConnection,
  AgentCreateIssueActionInput,
  AgentDeleteIssueActionInput,
  AgentGetIssueInput,
  AgentGuardedWebSearchQuery,
  AgentIssue,
  AgentIssueAction,
  AgentIssueActionKind,
  AgentIssueActionPreview,
  AgentIssueAttachment,
  AgentIssueDetail,
  AgentIssueLabel,
  AgentMember,
  AgentOrganizationContext,
  AgentResumeTicket,
  AgentRunGrant,
  AgentRunResult,
  AgentSearchIssuesInput,
  AgentThreadRenameResult,
  AgentUpdateIssueActionInput,
  AgentUsageRecordInput,
  AgentUsageRecordResult,
  AgentWebSearchReservation,
} from "./schemas"

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

export type AgentInternalFetchBinding = {
  fetch(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): ReturnType<typeof fetch>
}
