import {
  issuePriorities,
  issueStatuses,
} from "@enterprise-agentic-saas/db/schema"
import * as v from "valibot"

import { FILE_LIST_DEFAULT_LIMIT, FILE_LIST_MAX_LIMIT } from "../files/public"
import { boundedSearchModel, identifierModel, limitModel } from "./model"

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

export const getAgentIssueAttachmentImageInputModel = v.strictObject({
  grant: agentTokenModel,
  issueId: identifierModel,
  fileId: identifierModel,
})

export const finishAgentRunInputModel = v.strictObject({
  grant: agentTokenModel,
  outcome: v.picklist(["completed", "failed"]),
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
    attachmentCursor: v.optional(
      v.pipe(v.string(), v.minLength(1), v.maxLength(1024))
    ),
    attachmentLimit: v.optional(
      v.pipe(
        v.number(),
        v.integer(),
        v.minValue(1),
        v.maxValue(FILE_LIST_MAX_LIMIT)
      ),
      FILE_LIST_DEFAULT_LIMIT
    ),
  }),
  v.strictObject({
    grant: agentTokenModel,
    lookup: v.literal("number"),
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    attachmentCursor: v.optional(
      v.pipe(v.string(), v.minLength(1), v.maxLength(1024))
    ),
    attachmentLimit: v.optional(
      v.pipe(
        v.number(),
        v.integer(),
        v.minValue(1),
        v.maxValue(FILE_LIST_MAX_LIMIT)
      ),
      FILE_LIST_DEFAULT_LIMIT
    ),
  }),
])
