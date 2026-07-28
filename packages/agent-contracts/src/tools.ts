import * as v from "valibot"

import {
  agentAccountContextSchema,
  agentActionExecutionResultSchema,
  agentAttachmentMutationReceiptSchema,
  agentIdentifierSchema,
  agentIssueLabelListSchema,
  agentIssuePrioritySchema,
  agentIssueSchema,
  agentIssueStatusSchema,
  agentMemberListSchema,
  agentOrganizationContextSchema,
  agentPositiveIntegerSchema,
  agentIssueActionPreviewSchema,
} from "./schemas"

const optionalBoundedQuery = (maximum: number) =>
  v.optional(v.pipe(v.string(), v.maxLength(maximum)))
const limitSchema = v.optional(
  v.pipe(agentPositiveIntegerSchema, v.maxValue(50)),
  20
)
const rawIdentifierSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(130))

export const emptyToolInputSchema = v.strictObject({})
export const memberSearchToolInputSchema = v.strictObject({
  limit: limitSchema,
  query: optionalBoundedQuery(200),
})
export const labelSearchToolInputSchema = v.strictObject({
  limit: limitSchema,
  query: optionalBoundedQuery(40),
})
export const issueSearchToolInputSchema = v.strictObject({
  assigneeId: v.optional(agentIdentifierSchema),
  label: optionalBoundedQuery(40),
  limit: limitSchema,
  priority: v.optional(agentIssuePrioritySchema),
  search: optionalBoundedQuery(200),
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
  status: v.optional(agentIssueStatusSchema),
})

const optionalAssigneeToolSchema = v.optional(
  v.union([rawIdentifierSchema, v.literal(""), v.null()])
)
const labelsToolSchema = v.optional(
  v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(40))),
    v.maxLength(20)
  )
)
const attachmentAssetIdsToolSchema = v.optional(
  v.pipe(v.array(rawIdentifierSchema), v.maxLength(4))
)
const mutableIssueToolEntries = {
  assigneeId: optionalAssigneeToolSchema,
  description: v.optional(v.pipe(v.string(), v.maxLength(50_000))),
  dueDate: v.optional(
    v.nullable(v.pipe(v.string(), v.isoTimestamp(), v.maxLength(40)))
  ),
  labels: labelsToolSchema,
  priority: v.optional(agentIssuePrioritySchema),
  status: v.optional(agentIssueStatusSchema),
  title: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
}

export const createIssueToolInputSchema = v.strictObject({
  ...mutableIssueToolEntries,
  attachmentAssetIds: attachmentAssetIdsToolSchema,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
})
export const updateIssueToolInputSchema = v.strictObject({
  ...mutableIssueToolEntries,
  expectedRevision: agentPositiveIntegerSchema,
  issueId: rawIdentifierSchema,
})
export const deleteIssueToolInputSchema = v.strictObject({
  expectedRevision: agentPositiveIntegerSchema,
  issueId: rawIdentifierSchema,
})
export const addIssueAttachmentsToolInputSchema = v.strictObject({
  issueId: rawIdentifierSchema,
  expectedRevision: agentPositiveIntegerSchema,
  assetIds: v.pipe(
    v.array(rawIdentifierSchema),
    v.minLength(1),
    v.maxLength(4),
    v.checkItems((item, index, array) => array.indexOf(item) === index)
  ),
})
export const removeIssueAttachmentsToolInputSchema = v.strictObject({
  issueId: rawIdentifierSchema,
  expectedRevision: agentPositiveIntegerSchema,
  fileIds: v.pipe(
    v.array(rawIdentifierSchema),
    v.minLength(1),
    v.maxLength(20),
    v.checkItems((item, index, array) => array.indexOf(item) === index)
  ),
})
export const readIssueAttachmentImageToolInputSchema = v.strictObject({
  fileId: rawIdentifierSchema,
  issueId: rawIdentifierSchema,
})
export const readIssueAttachmentImageToolResultSchema = v.strictObject({
  contentType: v.literal("image/webp"),
  fileId: agentIdentifierSchema,
  issueId: agentIdentifierSchema,
  sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(0)),
})
export const issueSearchToolOutputSchema = v.pipe(
  v.array(
    v.strictObject({
      ...agentIssueSchema.entries,
      description: v.pipe(v.string(), v.maxLength(2_000)),
    })
  ),
  v.maxLength(50)
)

export const issueWriteToolOutputSchema = v.union([
  v.strictObject({
    actionId: agentIdentifierSchema,
    expiresAt: v.pipe(v.string(), v.maxLength(64)),
    preview: agentIssueActionPreviewSchema,
    requiresApproval: v.literal(true),
    status: v.literal("pending"),
  }),
  agentActionExecutionResultSchema,
  v.strictObject({
    actionId: agentIdentifierSchema,
    requiresApproval: v.literal(false),
    status: v.picklist(["rejected", "expired", "canceled", "conflicted"]),
  }),
])

const providerAttachmentMutationSchema = v.variant("operation", [
  v.strictObject({
    operation: v.literal("added"),
    fileIds: v.pipe(
      v.array(agentIdentifierSchema),
      v.minLength(1),
      v.maxLength(4)
    ),
  }),
  v.strictObject({
    operation: v.literal("removed"),
    fileIds: v.pipe(
      v.array(agentIdentifierSchema),
      v.minLength(1),
      v.maxLength(20)
    ),
  }),
])
const providerActionExecutionResultSchema = v.strictObject({
  actionId: agentIdentifierSchema,
  kind: agentIssueActionPreviewSchema.entries.kind,
  status: v.literal("succeeded"),
  issue: v.strictObject({
    id: agentIdentifierSchema,
    number: agentPositiveIntegerSchema,
    revision: agentPositiveIntegerSchema,
    deleted: v.boolean(),
    attachmentMutation: v.optional(providerAttachmentMutationSchema),
  }),
})
export const issueWriteToolProviderOutputSchema = v.union([
  issueWriteToolOutputSchema.options[0],
  providerActionExecutionResultSchema,
  issueWriteToolOutputSchema.options[2],
])
const providerAttachmentReceiptSchema = v.variant("operation", [
  v.strictObject({
    actionId: agentIdentifierSchema,
    operation: v.literal("added"),
    issueId: agentIdentifierSchema,
    issueNumber: agentPositiveIntegerSchema,
    revision: agentPositiveIntegerSchema,
    fileIds: v.pipe(
      v.array(agentIdentifierSchema),
      v.minLength(1),
      v.maxLength(4)
    ),
  }),
  v.strictObject({
    actionId: agentIdentifierSchema,
    operation: v.literal("removed"),
    issueId: agentIdentifierSchema,
    issueNumber: agentPositiveIntegerSchema,
    revision: agentPositiveIntegerSchema,
    fileIds: v.pipe(
      v.array(agentIdentifierSchema),
      v.minLength(1),
      v.maxLength(20)
    ),
  }),
])
export const attachmentWriteToolProviderOutputSchema = v.union([
  issueWriteToolOutputSchema.options[0],
  providerAttachmentReceiptSchema,
  issueWriteToolOutputSchema.options[2],
])
export const addAttachmentWriteToolProviderOutputSchema = v.union([
  issueWriteToolOutputSchema.options[0],
  providerAttachmentReceiptSchema.options[0],
  issueWriteToolOutputSchema.options[2],
])
export const removeAttachmentWriteToolProviderOutputSchema = v.union([
  issueWriteToolOutputSchema.options[0],
  providerAttachmentReceiptSchema.options[1],
  issueWriteToolOutputSchema.options[2],
])

export const attachmentWriteToolOutputSchema = v.union([
  issueWriteToolOutputSchema.options[0],
  agentAttachmentMutationReceiptSchema,
  issueWriteToolOutputSchema.options[2],
])
const addAttachmentWriteToolShapeSchema = v.union([
  issueWriteToolOutputSchema.options[0],
  agentAttachmentMutationReceiptSchema.options[0],
  issueWriteToolOutputSchema.options[2],
])
export const addAttachmentWriteToolOutputSchema = v.pipe(
  addAttachmentWriteToolShapeSchema,
  v.check(
    (output) =>
      "operation" in output ||
      ("status" in output &&
        output.status === "pending" &&
        output.preview.attachmentOperation === "add" &&
        output.preview.attachments.every(
          (attachment) => attachment.source === "asset"
        )) ||
      ("status" in output && output.status !== "pending"),
    "Invalid add attachment output"
  )
)
const removeAttachmentWriteToolShapeSchema = v.union([
  issueWriteToolOutputSchema.options[0],
  agentAttachmentMutationReceiptSchema.options[1],
  issueWriteToolOutputSchema.options[2],
])
export const removeAttachmentWriteToolOutputSchema = v.pipe(
  removeAttachmentWriteToolShapeSchema,
  v.check(
    (output) =>
      "operation" in output ||
      ("status" in output &&
        output.status === "pending" &&
        output.preview.attachmentOperation === "remove" &&
        output.preview.attachments.every(
          (attachment) => attachment.source === "file"
        )) ||
      ("status" in output && output.status !== "pending"),
    "Invalid remove attachment output"
  )
)

export const readAccountContextToolOutputSchema = agentAccountContextSchema
export const readActiveOrganizationToolOutputSchema =
  agentOrganizationContextSchema
export const memberSearchToolOutputSchema = agentMemberListSchema
export const labelSearchToolOutputSchema = agentIssueLabelListSchema

export type MemberSearchToolInput = v.InferOutput<
  typeof memberSearchToolInputSchema
>
export type LabelSearchToolInput = v.InferOutput<
  typeof labelSearchToolInputSchema
>
export type IssueSearchToolInput = v.InferOutput<
  typeof issueSearchToolInputSchema
>
export type CreateIssueToolInput = v.InferOutput<
  typeof createIssueToolInputSchema
>
export type UpdateIssueToolInput = v.InferOutput<
  typeof updateIssueToolInputSchema
>
export type DeleteIssueToolInput = v.InferOutput<
  typeof deleteIssueToolInputSchema
>
export type AddIssueAttachmentsToolInput = v.InferOutput<
  typeof addIssueAttachmentsToolInputSchema
>
export type RemoveIssueAttachmentsToolInput = v.InferOutput<
  typeof removeIssueAttachmentsToolInputSchema
>
export type ReadIssueAttachmentImageToolInput = v.InferOutput<
  typeof readIssueAttachmentImageToolInputSchema
>
export type ReadIssueAttachmentImageToolResult = v.InferOutput<
  typeof readIssueAttachmentImageToolResultSchema
>
export type IssueWriteToolOutput = v.InferOutput<
  typeof issueWriteToolOutputSchema
>
export type AttachmentWriteToolOutput = v.InferOutput<
  typeof attachmentWriteToolOutputSchema
>
export type AddAttachmentWriteToolOutput =
  | v.InferOutput<(typeof issueWriteToolOutputSchema.options)[0]>
  | v.InferOutput<(typeof agentAttachmentMutationReceiptSchema.options)[0]>
  | v.InferOutput<(typeof issueWriteToolOutputSchema.options)[2]>
export type RemoveAttachmentWriteToolOutput =
  | v.InferOutput<(typeof issueWriteToolOutputSchema.options)[0]>
  | v.InferOutput<(typeof agentAttachmentMutationReceiptSchema.options)[1]>
  | v.InferOutput<(typeof issueWriteToolOutputSchema.options)[2]>
