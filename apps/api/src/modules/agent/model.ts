import * as v from "valibot"

import {
  agentJsonValueSchema,
  agentUiMessageListSchema,
} from "../../agent-client"
import { isoTimestampModel } from "../../models/common"

export const identifierModel = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9_-]+$/)
)
export const agentRunParamsModel = v.strictObject({
  threadId: identifierModel,
  runId: identifierModel,
})

const agentUiMessageListModel = v.pipe(
  agentUiMessageListSchema,
  v.maxLength(100)
)
export const agentMessagePageModel = v.strictObject({
  messages: agentUiMessageListModel,
  total: v.pipe(v.number(), v.integer(), v.minValue(0)),
  page: v.pipe(v.number(), v.integer(), v.minValue(0)),
  perPage: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  hasMore: v.boolean(),
})
export const agentMessagePageQueryModel = v.strictObject({
  page: v.optional(
    v.pipe(v.string(), v.regex(/^[0-9]+$/), v.transform(Number)),
    "0"
  ),
  perPage: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^[1-9][0-9]*$/),
      v.transform(Number),
      v.maxValue(100)
    ),
    "40"
  ),
})

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
  messageId: v.pipe(
    identifierModel,
    v.check(
      (value) => !/_q_[0-9a-f]{48}$/.test(value),
      "Agent message id uses a reserved suffix"
    )
  ),
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
  input: agentJsonValueSchema,
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
    input: v.optional(agentJsonValueSchema),
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
  status: v.picklist(["active", "archived"]),
  createdAt: isoTimestampModel,
  updatedAt: isoTimestampModel,
})

export const agentThreadListModel = v.array(agentThreadModel)

export const agentMemoryThreadListModel = v.pipe(
  v.array(
    v.strictObject({
      id: identifierModel,
      title: titleModel,
      updatedAt: isoTimestampModel,
    })
  ),
  v.maxLength(1_000)
)

export const agentThreadPermissionModeModel = v.picklist([
  "ask_always",
  "full_access",
])

export const createAgentThreadBodyModel = v.strictObject({
  permissionMode: v.optional(agentThreadPermissionModeModel, "ask_always"),
})

export const agentThreadParamsModel = v.strictObject({
  threadId: identifierModel,
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
