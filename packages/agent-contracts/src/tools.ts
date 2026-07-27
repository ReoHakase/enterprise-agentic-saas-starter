import * as v from "valibot"

import {
  agentAccountContextSchema,
  agentActionExecutionResultSchema,
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
export type IssueWriteToolOutput = v.InferOutput<
  typeof issueWriteToolOutputSchema
>
