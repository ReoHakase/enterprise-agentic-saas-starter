import {
  issuePriorities,
  issueStatuses,
} from "@enterprise-agentic-saas/db/schema"
import * as v from "valibot"

import type { AgentCanonicalJsonValue } from "../../agent-client"
import { isoTimestampModel } from "../../models/common"

const identifierModel = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9_-]+$/)
)

const boundedJsonValue = (
  value: unknown,
  depth = 0
): value is AgentCanonicalJsonValue => {
  if (value === null || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value === "string") return value.length <= 10_000
  if (depth >= 8 || typeof value !== "object") return false
  if (Array.isArray(value)) {
    return (
      value.length <= 100 &&
      value.every((item) => boundedJsonValue(item, depth + 1))
    )
  }
  const entries = Object.entries(value)
  return (
    entries.length <= 100 &&
    entries.every(
      ([key, nested]) =>
        key.length <= 128 && boundedJsonValue(nested, depth + 1)
    )
  )
}

const canonicalJsonValueModel = v.custom<AgentCanonicalJsonValue>(
  (value) => boundedJsonValue(value),
  "Invalid bounded JSON value"
)

const canonicalToolNames = [
  "create_issue",
  "delete_issue",
  "get_issue",
  "read_account_context",
  "read_active_organization",
  "rename_thread",
  "search_issue_labels",
  "search_issues",
  "search_organization_members",
  "ui_navigate",
  "ui_open_issue",
  "ui_patch_form_draft",
  "ui_read_form_draft",
  "ui_set_issue_query",
  "update_issue",
  "web_search",
] as const

const canonicalToolTypes = canonicalToolNames.map(
  (name) => `tool-${name}` as const
)

const canonicalToolPartModel = v.strictObject({
  type: v.picklist(canonicalToolTypes),
  toolCallId: identifierModel,
  state: v.picklist([
    "input-available",
    "output-available",
    "output-denied",
    "output-error",
  ]),
  input: v.optional(canonicalJsonValueModel),
  output: v.optional(canonicalJsonValueModel),
  errorText: v.optional(v.pipe(v.string(), v.maxLength(2_000))),
})

const canonicalMessagePartModel = v.union([
  v.strictObject({
    type: v.literal("data-agent-assets"),
    data: v.strictObject({
      assetIds: v.pipe(
        v.array(identifierModel),
        v.minLength(1),
        v.maxLength(4),
        v.checkItems((item, index, array) => array.indexOf(item) === index)
      ),
    }),
  }),
  v.strictObject({
    type: v.literal("text"),
    text: v.pipe(v.string(), v.maxLength(50_000)),
  }),
  v.strictObject({
    type: v.literal("data-activity"),
    data: v.strictObject({
      kind: v.picklist(["status", "tool"]),
      status: v.picklist(["running", "completed", "failed"]),
      label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
    }),
  }),
  v.strictObject({
    type: v.literal("data-context-budget"),
    data: v.strictObject({
      contextWindowTokens: v.pipe(v.number(), v.integer(), v.minValue(1)),
      reservedOutputTokens: v.pipe(v.number(), v.integer(), v.minValue(1)),
      estimated: v.strictObject({
        system: v.pipe(v.number(), v.integer(), v.minValue(0)),
        skills: v.pipe(v.number(), v.integer(), v.minValue(0)),
        tools: v.pipe(v.number(), v.integer(), v.minValue(0)),
        history: v.pipe(v.number(), v.integer(), v.minValue(0)),
        pageContext: v.pipe(v.number(), v.integer(), v.minValue(0)),
        attachments: v.pipe(v.number(), v.integer(), v.minValue(0)),
        total: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
      observedInputTokens: v.nullable(
        v.pipe(v.number(), v.integer(), v.minValue(0))
      ),
      level: v.picklist(["normal", "notice", "warning", "critical"]),
    }),
  }),
  v.strictObject({
    type: v.literal("data-thread-title"),
    data: v.strictObject({
      threadId: identifierModel,
      title: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
      renamed: v.boolean(),
    }),
  }),
  v.strictObject({
    type: v.literal("reasoning"),
    text: v.pipe(v.string(), v.maxLength(20_000)),
  }),
  v.strictObject({
    type: v.literal("source-url"),
    sourceId: identifierModel,
    url: v.pipe(
      v.string(),
      v.maxLength(2_048),
      v.check((value) => {
        try {
          const protocol = new URL(value).protocol
          return protocol === "http:" || protocol === "https:"
        } catch {
          return false
        }
      }, "Invalid source URL")
    ),
    title: v.optional(v.pipe(v.string(), v.maxLength(500))),
  }),
  v.strictObject({ type: v.literal("step-start") }),
  canonicalToolPartModel,
])

export const agentCanonicalMessageModel = v.pipe(
  v.strictObject({
    id: identifierModel,
    role: v.picklist(["user", "assistant"]),
    parts: v.pipe(
      v.array(canonicalMessagePartModel),
      v.minLength(1),
      v.maxLength(64)
    ),
  }),
  v.check(
    (message) => JSON.stringify(message).length <= 131_072,
    "Agent message is too large"
  ),
  v.check(
    (message) =>
      message.role === "assistant"
        ? message.parts.every((part) => part.type !== "data-agent-assets")
        : message.parts.length <= 2 &&
          message.parts[0]?.type === "text" &&
          (message.parts.length === 1 ||
            message.parts[1]?.type === "data-agent-assets"),
    "Invalid parts for agent message role"
  )
)

export const agentCanonicalMessageListModel = v.pipe(
  v.array(agentCanonicalMessageModel),
  v.maxLength(40)
)

const publicUserMessageModel = v.strictObject({
  id: identifierModel,
  role: v.literal("user"),
  parts: v.tuple([
    v.strictObject({
      type: v.literal("text"),
      text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20_000)),
    }),
  ]),
})

const contextReferenceModel = v.variant("kind", [
  v.strictObject({
    kind: v.picklist(["issue", "selected_issue"]),
    id: identifierModel,
    label: v.optional(v.pipe(v.string(), v.maxLength(200))),
  }),
  v.strictObject({
    kind: v.literal("file"),
    id: identifierModel,
    label: v.optional(v.pipe(v.string(), v.maxLength(200))),
  }),
  v.strictObject({
    kind: v.literal("member"),
    id: identifierModel,
    label: v.optional(v.pipe(v.string(), v.maxLength(200))),
  }),
  v.strictObject({
    kind: v.literal("current_page"),
    path: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1),
      v.maxLength(500),
      v.regex(/^\/organization\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_/?=&.-]*)?$/)
    ),
    label: v.optional(v.pipe(v.string(), v.maxLength(200))),
  }),
])

const agentUserChatBodyModel = v.strictObject({
  threadId: identifierModel,
  message: publicUserMessageModel,
  assetIds: v.optional(
    v.pipe(
      v.array(identifierModel),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
    []
  ),
  contextReferences: v.optional(
    v.pipe(v.array(contextReferenceModel), v.maxLength(12)),
    []
  ),
  timezone: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
})

const clientToolNameModel = v.picklist([
  "ui_navigate",
  "ui_open_issue",
  "ui_patch_form_draft",
  "ui_read_form_draft",
  "ui_set_issue_query",
])

const clientToolSuccessBase = {
  toolCallId: identifierModel,
  toolName: clientToolNameModel,
  state: v.literal("output-available"),
}

const clientToolSimpleOutputModel = v.strictObject({ ok: v.literal(true) })
const clientToolQueryOutputModel = v.strictObject({
  ok: v.literal(true),
  query: v.strictObject({
    q: v.pipe(v.string(), v.maxLength(200)),
    status: v.picklist(["all", "open", "in_progress", "closed"]),
    priority: v.picklist([
      "all",
      "no_priority",
      "low",
      "medium",
      "high",
      "urgent",
    ]),
    assignee: v.pipe(v.string(), v.maxLength(128)),
    label: v.pipe(v.string(), v.maxLength(40)),
    sort: v.picklist([
      "number",
      "createdAt",
      "updatedAt",
      "dueDate",
      "priority",
      "status",
    ]),
    dir: v.picklist(["asc", "desc"]),
    page: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000)),
  }),
})
const clientToolFormOutputModel = v.strictObject({
  formId: identifierModel,
  resource: v.literal("issue"),
  resourceId: v.optional(identifierModel),
  revision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  epoch: identifierModel,
  values: v.strictObject({
    title: v.optional(v.pipe(v.string(), v.maxLength(200))),
    description: v.optional(v.pipe(v.string(), v.maxLength(50_000))),
  }),
  dirtyFields: v.pipe(
    v.array(v.picklist(["title", "description"])),
    v.maxLength(2),
    v.checkItems((item, index, array) => array.indexOf(item) === index)
  ),
})

const clientToolResultModel = v.variant("state", [
  v.variant("toolName", [
    v.strictObject({
      ...clientToolSuccessBase,
      toolName: v.literal("ui_navigate"),
      output: clientToolSimpleOutputModel,
    }),
    v.strictObject({
      ...clientToolSuccessBase,
      toolName: v.literal("ui_open_issue"),
      output: clientToolSimpleOutputModel,
    }),
    v.strictObject({
      ...clientToolSuccessBase,
      toolName: v.literal("ui_set_issue_query"),
      output: clientToolQueryOutputModel,
    }),
    v.strictObject({
      ...clientToolSuccessBase,
      toolName: v.literal("ui_read_form_draft"),
      output: clientToolFormOutputModel,
    }),
    v.strictObject({
      ...clientToolSuccessBase,
      toolName: v.literal("ui_patch_form_draft"),
      output: clientToolFormOutputModel,
    }),
  ]),
  v.strictObject({
    toolCallId: identifierModel,
    toolName: clientToolNameModel,
    state: v.literal("output-error"),
    errorText: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  }),
])

const agentClientToolContinuationBodyModel = v.strictObject({
  threadId: identifierModel,
  assistantMessageId: identifierModel,
  clientToolResults: v.pipe(
    v.array(clientToolResultModel),
    v.minLength(1),
    v.maxLength(4),
    v.checkItems(
      (item, index, array) =>
        array.findIndex(
          (candidate) => candidate.toolCallId === item.toolCallId
        ) === index
    )
  ),
  timezone: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
})

export const agentChatBodyModel = v.union([
  agentUserChatBodyModel,
  agentClientToolContinuationBodyModel,
])

const titleModel = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(120)
)

const boundedSearchModel = v.pipe(v.string(), v.trim(), v.maxLength(200))

const limitModel = v.optional(
  v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
  20
)

export const agentThreadModel = v.object({
  id: identifierModel,
  title: titleModel,
  status: v.picklist(["active", "archived"]),
  messageCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  createdAt: isoTimestampModel,
  updatedAt: isoTimestampModel,
})

export const agentThreadListModel = v.array(agentThreadModel)

export const createAgentThreadBodyModel = v.strictObject({
  title: v.optional(titleModel),
})

export const agentThreadParamsModel = v.strictObject({
  threadId: identifierModel,
})

export const agentThreadContextModel = v.object({
  threadId: identifierModel,
  messageCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  estimatedHistoryTokens: v.pipe(v.number(), v.integer(), v.minValue(0)),
  latestSummaryThroughSequence: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(1))
  ),
  latestSummaryEstimatedTokens: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(1))
  ),
})

export const agentUsageQueryModel = v.strictObject({
  month: v.optional(
    v.pipe(v.string(), v.regex(/^[0-9]{4}-(?:0[1-9]|1[0-2])$/))
  ),
})

const usageTotalModel = v.object({
  runCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  inputTokenCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  outputTokenCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  reasoningTokenCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  totalTokenCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  costMicros: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export const agentMonthlyUsageModel = v.object({
  month: v.pipe(v.string(), v.regex(/^[0-9]{4}-(?:0[1-9]|1[0-2])$/)),
  totals: usageTotalModel,
  byModel: v.array(
    v.object({
      provider: v.string(),
      model: v.string(),
      ...usageTotalModel.entries,
    })
  ),
})

export const agentOrganizationUsageModel = v.object({
  month: v.pipe(v.string(), v.regex(/^[0-9]{4}-(?:0[1-9]|1[0-2])$/)),
  rows: v.array(
    v.object({
      userId: identifierModel,
      provider: v.string(),
      model: v.string(),
      ...usageTotalModel.entries,
    })
  ),
})

export const createAgentConnectionBodyModel = v.strictObject({
  threadId: identifierModel,
})

export const agentConnectionTicketModel = v.object({
  ticket: v.pipe(
    v.string(),
    v.minLength(32),
    v.maxLength(512),
    v.regex(/^[A-Za-z0-9._~-]+$/)
  ),
  expiresAt: isoTimestampModel,
})

export const agentContextRevocationModel = v.object({
  contextEpoch: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export const agentTokenModel = v.pipe(
  v.string(),
  v.minLength(32),
  v.maxLength(512),
  v.regex(/^[A-Za-z0-9._~-]+$/)
)

export const consumeConnectionTicketInputModel = v.strictObject({
  ticket: agentTokenModel,
  threadId: identifierModel,
})

export const startAgentRunInputModel = v.strictObject({
  grant: agentTokenModel,
  clientMessageId: identifierModel,
  estimatedInputTokenCount: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(995_904)),
    0
  ),
  assetIds: v.optional(
    v.pipe(
      v.array(identifierModel),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
    []
  ),
  trigger: v.optional(
    v.picklist(["user_message", "client_tool_result"]),
    "user_message"
  ),
})

export const agentGrantInputModel = v.strictObject({
  grant: agentTokenModel,
})

export const renameAgentThreadInputModel = v.strictObject({
  grant: agentTokenModel,
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
})

export const reserveAgentWebSearchInputModel = v.strictObject({
  grant: agentTokenModel,
  operationId: identifierModel,
})

export const guardAgentWebSearchInputModel = v.strictObject({
  grant: agentTokenModel,
  query: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(200)),
})

const usageCountModel = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(100_000_000)
)

export const recordAgentUsageObjectModel = v.strictObject({
  grant: agentTokenModel,
  provider: v.literal("openrouter"),
  model: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(160)),
  inputTokenCount: usageCountModel,
  inputNoCacheTokenCount: usageCountModel,
  cacheReadTokenCount: usageCountModel,
  cacheWriteTokenCount: usageCountModel,
  outputTokenCount: usageCountModel,
  textOutputTokenCount: usageCountModel,
  reasoningTokenCount: usageCountModel,
  totalTokenCount: usageCountModel,
  imageInputCount: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(4)
  ),
  providerCostMicros: v.optional(usageCountModel),
  durationMs: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(300_000)
  ),
  runEventId: identifierModel,
})

export const recordAgentUsageInputModel = v.pipe(
  recordAgentUsageObjectModel,
  v.check(
    (usage) =>
      usage.inputNoCacheTokenCount +
        usage.cacheReadTokenCount +
        usage.cacheWriteTokenCount <=
        usage.inputTokenCount &&
      usage.textOutputTokenCount + usage.reasoningTokenCount <=
        usage.outputTokenCount &&
      usage.totalTokenCount === usage.inputTokenCount + usage.outputTokenCount,
    "Invalid usage token shape"
  )
)

export const getAgentImageInputModel = v.strictObject({
  grant: agentTokenModel,
  assetId: identifierModel,
})

export const finishAgentRunInputModel = v.strictObject({
  grant: agentTokenModel,
  outcome: v.picklist(["completed", "failed"]),
})

export const appendAgentRunMessagesInputModel = v.strictObject({
  grant: agentTokenModel,
  messages: v.pipe(
    v.array(agentCanonicalMessageModel),
    v.minLength(1),
    v.maxLength(4),
    v.everyItem((message) => message.role === "assistant")
  ),
})

export const searchAgentMembersInputModel = v.strictObject({
  grant: agentTokenModel,
  query: v.optional(boundedSearchModel, ""),
  limit: limitModel,
})

export const searchAgentLabelsInputModel = v.strictObject({
  grant: agentTokenModel,
  query: v.optional(v.pipe(boundedSearchModel, v.maxLength(40)), ""),
  limit: limitModel,
})

export const searchAgentIssuesInputModel = v.strictObject({
  grant: agentTokenModel,
  search: v.optional(boundedSearchModel),
  status: v.optional(v.picklist(issueStatuses)),
  priority: v.optional(v.picklist(issuePriorities)),
  assigneeId: v.optional(identifierModel),
  label: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))
  ),
  sortBy: v.optional(
    v.picklist([
      "number",
      "createdAt",
      "updatedAt",
      "dueDate",
      "priority",
      "status",
    ])
  ),
  sortDirection: v.optional(v.picklist(["asc", "desc"])),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
    50
  ),
})

export const getAgentIssueInputModel = v.variant("lookup", [
  v.strictObject({
    grant: agentTokenModel,
    lookup: v.literal("id"),
    id: identifierModel,
  }),
  v.strictObject({
    grant: agentTokenModel,
    lookup: v.literal("number"),
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
])

const actionIdempotencyKeyModel = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(8),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9._~-]+$/)
)

const issueTitleModel = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200)
)
const issueDescriptionModel = v.pipe(v.string(), v.maxLength(50_000))
const issueLabelsModel = v.pipe(
  v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))),
  v.maxLength(20)
)
const expectedRevisionModel = v.pipe(v.number(), v.integer(), v.minValue(1))

export const createIssueActionPayloadModel = v.strictObject({
  title: issueTitleModel,
  description: v.optional(issueDescriptionModel),
  status: v.optional(v.picklist(issueStatuses)),
  priority: v.optional(v.picklist(issuePriorities)),
  assigneeId: v.optional(v.nullable(identifierModel)),
  labels: v.optional(issueLabelsModel),
  dueDate: v.optional(v.nullable(isoTimestampModel)),
  attachmentAssetIds: v.optional(
    v.pipe(
      v.array(identifierModel),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
    []
  ),
})

export const updateIssueActionPayloadModel = v.strictObject({
  issueId: identifierModel,
  expectedRevision: expectedRevisionModel,
  title: v.optional(issueTitleModel),
  description: v.optional(issueDescriptionModel),
  status: v.optional(v.picklist(issueStatuses)),
  priority: v.optional(v.picklist(issuePriorities)),
  assigneeId: v.optional(v.nullable(identifierModel)),
  labels: v.optional(issueLabelsModel),
  dueDate: v.optional(v.nullable(isoTimestampModel)),
})

export const deleteIssueActionPayloadModel = v.strictObject({
  issueId: identifierModel,
  expectedRevision: expectedRevisionModel,
})

const prepareActionBaseEntries = {
  grant: agentTokenModel,
  toolCallId: identifierModel,
  idempotencyKey: actionIdempotencyKeyModel,
}

export const prepareCreateIssueInputModel = v.strictObject({
  ...prepareActionBaseEntries,
  issue: createIssueActionPayloadModel,
})

export const prepareUpdateIssueInputModel = v.strictObject({
  ...prepareActionBaseEntries,
  issue: updateIssueActionPayloadModel,
})

export const prepareDeleteIssueInputModel = v.strictObject({
  ...prepareActionBaseEntries,
  issue: deleteIssueActionPayloadModel,
})

export const getIssueActionDecisionInputModel = v.strictObject({
  grant: agentTokenModel,
  actionId: identifierModel,
})

export const resumeApprovedActionInputModel = v.strictObject({
  actionId: identifierModel,
  resumeTicket: agentTokenModel,
})

export const executeApprovedActionInputModel = v.strictObject({
  grant: agentTokenModel,
  actionId: identifierModel,
})

/**
 * private Service Binding HTTP境界ではcapabilityをBearerへ移し、body/queryは
 * domain inputだけを受理する。repository向けmodelとは意図的に分離する。
 */
export const agentInternalAuthorizationModel = v.strictObject({
  authorization: v.pipe(
    v.string(),
    v.regex(/^Bearer [A-Za-z0-9._~-]{32,512}$/)
  ),
})

const actionPreviewValueModel = v.union([
  v.string(),
  v.array(v.string()),
  v.null(),
])

export const agentIssueActionPreviewModel = v.object({
  kind: v.picklist(["create_issue", "update_issue", "delete_issue"]),
  destructive: v.boolean(),
  title: v.string(),
  issueNumber: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  issueRevision: v.nullable(expectedRevisionModel),
  fields: v.array(
    v.object({
      field: v.picklist([
        "title",
        "description",
        "status",
        "priority",
        "assignee",
        "labels",
        "due_date",
      ]),
      before: actionPreviewValueModel,
      after: actionPreviewValueModel,
    })
  ),
  attachments: v.array(
    v.object({
      assetId: identifierModel,
      filename: v.string(),
      sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(0)),
    })
  ),
})

export const agentIssueActionModel = v.object({
  id: identifierModel,
  kind: v.picklist(["create_issue", "update_issue", "delete_issue"]),
  status: v.picklist([
    "pending",
    "approved",
    "rejected",
    "expired",
    "canceled",
    "succeeded",
    "conflicted",
  ]),
  approvalMode: v.nullable(v.picklist(["manual", "auto_policy"])),
  requiresApproval: v.boolean(),
  preview: v.nullable(agentIssueActionPreviewModel),
  previewState: v.picklist(["available", "expired"]),
  expiresAt: isoTimestampModel,
  completedAt: v.nullable(isoTimestampModel),
})

export const agentActionParamsModel = v.strictObject({
  actionId: identifierModel,
})

export const decideAgentActionBodyModel = v.strictObject({
  decision: v.picklist(["yes", "no"]),
  idempotencyKey: actionIdempotencyKeyModel,
})

export const issueAgentResumeTicketModel = v.object({
  ticket: agentTokenModel,
  expiresAt: isoTimestampModel,
})

export const resumeAgentActionBodyModel = v.strictObject({})

export const agentActionExecutionResultModel = v.strictObject({
  actionId: identifierModel,
  kind: v.picklist(["create_issue", "update_issue", "delete_issue"]),
  status: v.literal("succeeded"),
  issue: v.strictObject({
    id: identifierModel,
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    revision: expectedRevisionModel,
    deleted: v.boolean(),
  }),
})

export const approvalPolicyModeModel = v.picklist([
  "ask_each",
  "auto_write",
  "auto_all",
])

export const getAgentApprovalPolicyQueryModel = v.strictObject({
  threadId: identifierModel,
})

export const deleteAgentApprovalPolicyQueryModel =
  getAgentApprovalPolicyQueryModel

export const putAgentApprovalPolicyBodyModel = v.strictObject({
  threadId: identifierModel,
  mode: approvalPolicyModeModel,
  expiresInSeconds: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(900)
  ),
  destructiveConfirmation: v.optional(v.literal("ALLOW_ISSUE_DELETE")),
})

export const agentApprovalPolicyModel = v.object({
  mode: approvalPolicyModeModel,
  expiresAt: v.nullable(isoTimestampModel),
  permissions: v.object({
    createIssue: v.boolean(),
    updateIssue: v.boolean(),
    deleteIssue: v.boolean(),
  }),
})
