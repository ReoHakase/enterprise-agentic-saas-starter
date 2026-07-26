import * as v from "valibot"

import type { AgentCanonicalJsonValue } from "../../agent-client"
import { isoTimestampModel } from "../../models/common"

export const identifierModel = v.pipe(
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
  "read_issue_attachment_image",
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
    type: v.literal("data-context-reference"),
    data: v.variant("kind", [
      v.strictObject({
        kind: v.literal("issue"),
        id: identifierModel,
        label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      }),
      v.strictObject({
        kind: v.picklist(["file", "member"]),
        id: identifierModel,
        label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      }),
      v.strictObject({
        kind: v.literal("current_page"),
        path: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
        label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      }),
    ]),
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
  v.check((message) => {
    if (message.role === "assistant") {
      return message.parts.every(
        (part) =>
          part.type !== "data-agent-assets" &&
          part.type !== "data-context-reference"
      )
    }
    const assetIndexes = message.parts.flatMap((part, index) =>
      part.type === "data-agent-assets" ? [index] : []
    )
    return (
      message.parts.every(
        (part) =>
          part.type === "text" ||
          part.type === "data-context-reference" ||
          part.type === "data-agent-assets"
      ) &&
      assetIndexes.length <= 1 &&
      (assetIndexes.length === 0 ||
        assetIndexes[0] === message.parts.length - 1)
    )
  }, "Invalid parts for agent message role")
)

export const agentCanonicalMessageListModel = v.pipe(
  v.array(agentCanonicalMessageModel),
  v.maxLength(40)
)

const contextReferenceModel = v.variant("kind", [
  v.strictObject({
    kind: v.literal("issue"),
    id: identifierModel,
  }),
  v.strictObject({
    kind: v.literal("file"),
    id: identifierModel,
  }),
  v.strictObject({
    kind: v.literal("member"),
    id: identifierModel,
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
  }),
])

const contentSegmentModel = v.variant("type", [
  v.strictObject({
    type: v.literal("text"),
    text: v.pipe(v.string(), v.maxLength(20_000)),
  }),
  v.strictObject({
    type: v.literal("context_reference"),
    reference: contextReferenceModel,
  }),
])

const agentUserChatBodyModel = v.strictObject({
  threadId: identifierModel,
  messageId: identifierModel,
  contentSegments: v.pipe(v.array(contentSegmentModel), v.maxLength(25)),
  assetIds: v.optional(
    v.pipe(
      v.array(identifierModel),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
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

const titleModel = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80))

export const boundedSearchModel = v.pipe(v.string(), v.trim(), v.maxLength(200))

export const limitModel = v.optional(
  v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
  20
)

export const agentThreadModel = v.object({
  id: identifierModel,
  title: titleModel,
  titleRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  status: v.picklist(["active", "archived"]),
  messageCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  createdAt: isoTimestampModel,
  updatedAt: isoTimestampModel,
})

export const agentThreadListModel = v.array(agentThreadModel)

export const updateAgentThreadTitleBodyModel = v.strictObject({
  title: titleModel,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export const agentThreadPermissionModeModel = v.picklist([
  "ask_always",
  "full_access",
])

export const createAgentThreadBodyModel = v.strictObject({
  title: v.optional(titleModel),
  permissionMode: v.optional(agentThreadPermissionModeModel, "ask_always"),
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
