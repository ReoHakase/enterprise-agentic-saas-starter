import * as v from "valibot"

import { FILE_LIST_MAX_LIMIT } from "../files/public"
import {
  prepareCreateIssueInputModel,
  prepareDeleteIssueInputModel,
  prepareUpdateIssueInputModel,
  resumeApprovedActionInputModel,
} from "./action-schema"
import {
  finishAgentRunInputModel,
  guardAgentWebSearchInputModel,
  recordAgentUsageObjectModel,
  reserveAgentWebSearchInputModel,
  startAgentRunInputModel,
} from "./runtime-schema"

const identifierModel = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9_-]+$/)
)

const positiveIntegerQueryModel = v.pipe(
  v.string(),
  v.regex(/^[1-9][0-9]*$/),
  v.transform(Number),
  v.integer(),
  v.minValue(1),
  v.maxValue(2_147_483_647)
)

const limitQueryModel = v.optional(
  v.pipe(positiveIntegerQueryModel, v.maxValue(50))
)

export const emptyBodyModel = v.strictObject({})
export const startRunBodyModel = v.omit(startAgentRunInputModel, ["grant"])
export const reserveWebSearchBodyModel = v.omit(
  reserveAgentWebSearchInputModel,
  ["grant"]
)
export const guardWebSearchBodyModel = v.omit(guardAgentWebSearchInputModel, [
  "grant",
])
export const finishRunBodyModel = v.omit(finishAgentRunInputModel, ["grant"])
export const recordUsageBodyModel = v.omit(recordAgentUsageObjectModel, [
  "grant",
])
export const resumeApprovedActionBodyModel = v.omit(
  resumeApprovedActionInputModel,
  ["actionId"]
)

export const memberSearchQueryModel = v.strictObject({
  query: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  limit: limitQueryModel,
})

export const labelSearchQueryModel = v.strictObject({
  query: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(40))),
  limit: limitQueryModel,
})

export const issueSearchQueryModel = v.strictObject({
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  status: v.optional(v.picklist(["open", "in_progress", "closed"])),
  priority: v.optional(
    v.picklist(["no_priority", "low", "medium", "high", "urgent"])
  ),
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
  limit: limitQueryModel,
})

export const issueIdParamsModel = v.strictObject({ issueId: identifierModel })
export const issueAttachmentParamsModel = v.strictObject({
  issueId: identifierModel,
  fileId: identifierModel,
})
export const issueNumberParamsModel = v.strictObject({
  number: positiveIntegerQueryModel,
})
export const actionIdParamsModel = v.strictObject({
  actionId: identifierModel,
})
export const assetIdParamsModel = v.strictObject({ assetId: identifierModel })

export const issueAttachmentQueryModel = v.strictObject({
  attachmentCursor: v.optional(
    v.pipe(v.string(), v.minLength(1), v.maxLength(1024))
  ),
  attachmentLimit: v.optional(
    v.pipe(positiveIntegerQueryModel, v.maxValue(FILE_LIST_MAX_LIMIT))
  ),
})

export const prepareIssueActionBodyModel = v.variant("kind", [
  v.strictObject({
    kind: v.literal("create_issue"),
    toolCallId: prepareCreateIssueInputModel.entries.toolCallId,
    idempotencyKey: prepareCreateIssueInputModel.entries.idempotencyKey,
    issue: prepareCreateIssueInputModel.entries.issue,
  }),
  v.strictObject({
    kind: v.literal("update_issue"),
    toolCallId: prepareUpdateIssueInputModel.entries.toolCallId,
    idempotencyKey: prepareUpdateIssueInputModel.entries.idempotencyKey,
    issue: prepareUpdateIssueInputModel.entries.issue,
  }),
  v.strictObject({
    kind: v.literal("delete_issue"),
    toolCallId: prepareDeleteIssueInputModel.entries.toolCallId,
    idempotencyKey: prepareDeleteIssueInputModel.entries.idempotencyKey,
    issue: prepareDeleteIssueInputModel.entries.issue,
  }),
])
