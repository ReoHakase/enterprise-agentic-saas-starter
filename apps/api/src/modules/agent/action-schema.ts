import {
  issuePriorities,
  issueStatuses,
} from "@enterprise-agentic-saas/db/schema"
import * as v from "valibot"

import { isoTimestampModel } from "../../models/common"
import { agentThreadPermissionModeModel, identifierModel } from "./model"
import { agentTokenModel } from "./runtime-schema"

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

const updateIssueActionBaseEntries = {
  issueId: identifierModel,
  expectedRevision: expectedRevisionModel,
}
export const updateIssueActionPayloadModel = v.union([
  v.strictObject({
    ...updateIssueActionBaseEntries,
    operation: v.optional(v.literal("fields")),
    title: v.optional(issueTitleModel),
    description: v.optional(issueDescriptionModel),
    status: v.optional(v.picklist(issueStatuses)),
    priority: v.optional(v.picklist(issuePriorities)),
    assigneeId: v.optional(v.nullable(identifierModel)),
    labels: v.optional(issueLabelsModel),
    dueDate: v.optional(v.nullable(isoTimestampModel)),
  }),
  v.strictObject({
    ...updateIssueActionBaseEntries,
    operation: v.literal("add_attachments"),
    attachmentAssetIds: v.pipe(
      v.array(identifierModel),
      v.minLength(1),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
  }),
  v.strictObject({
    ...updateIssueActionBaseEntries,
    operation: v.literal("remove_attachments"),
    attachmentFileIds: v.pipe(
      v.array(identifierModel),
      v.minLength(1),
      v.maxLength(20),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
  }),
])

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
  attachmentOperation: v.nullable(v.picklist(["add", "remove"])),
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
    v.variant("source", [
      v.object({
        source: v.literal("asset"),
        assetId: identifierModel,
        filename: v.string(),
        sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
      v.object({
        source: v.literal("file"),
        fileId: identifierModel,
        filename: v.string(),
        sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
    ])
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
  approvalMode: v.nullable(v.picklist(["manual", "full_access"])),
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

export const resumeAgentActionBodyModel = v.strictObject({})

const addedAttachmentFileIdsModel = v.pipe(
  v.array(identifierModel),
  v.minLength(1),
  v.maxLength(4),
  v.checkItems((item, index, array) => array.indexOf(item) === index)
)
const removedAttachmentFileIdsModel = v.pipe(
  v.array(identifierModel),
  v.minLength(1),
  v.maxLength(20),
  v.checkItems((item, index, array) => array.indexOf(item) === index)
)
const attachmentMutationModel = v.variant("operation", [
  v.strictObject({
    operation: v.literal("added"),
    fileIds: addedAttachmentFileIdsModel,
  }),
  v.strictObject({
    operation: v.literal("removed"),
    fileIds: removedAttachmentFileIdsModel,
  }),
])

export const agentActionExecutionResultModel = v.strictObject({
  actionId: identifierModel,
  kind: v.picklist(["create_issue", "update_issue", "delete_issue"]),
  status: v.literal("succeeded"),
  issue: v.strictObject({
    id: identifierModel,
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    revision: expectedRevisionModel,
    deleted: v.boolean(),
    attachmentMutation: v.optional(attachmentMutationModel),
  }),
})

const approvalPolicyModeModel = agentThreadPermissionModeModel

export const putAgentApprovalPolicyBodyModel = v.strictObject({
  mode: approvalPolicyModeModel,
})

export const agentApprovalPolicyModel = v.object({
  mode: approvalPolicyModeModel,
  permissions: v.object({
    createIssue: v.boolean(),
    updateIssue: v.boolean(),
    deleteIssue: v.boolean(),
  }),
})
export const agentStreamResponseModel = v.any()
