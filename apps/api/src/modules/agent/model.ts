import {
  issuePriorities,
  issueStatuses,
} from "@enterprise-agentic-saas/db/schema"
import * as v from "valibot"

import { isoTimestampModel } from "../../models/common"

const identifierModel = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9_-]+$/)
)

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
})

export const agentGrantInputModel = v.strictObject({
  grant: agentTokenModel,
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
  }),
  v.strictObject({
    grant: agentTokenModel,
    lookup: v.literal("number"),
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
])
