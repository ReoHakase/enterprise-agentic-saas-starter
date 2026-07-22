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
  assetIds: v.optional(
    v.pipe(
      v.array(identifierModel),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
    []
  ),
})

export const agentGrantInputModel = v.strictObject({
  grant: agentTokenModel,
})

export const getAgentImageInputModel = v.strictObject({
  grant: agentTokenModel,
  assetId: identifierModel,
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
