import * as v from "valibot"

export const agentIdentifierSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9_-]+$/)
)
export const agentTitleSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(200)
)
export const agentThreadTitleSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(80)
)
export const agentIsoTimestampSchema = v.pipe(
  v.string(),
  v.isoTimestamp(),
  v.maxLength(40)
)
export const agentNonNegativeIntegerSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(Number.MAX_SAFE_INTEGER)
)
export const agentPositiveIntegerSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(Number.MAX_SAFE_INTEGER)
)

export const agentRoleSchema = v.picklist(["owner", "admin", "member"])
export const agentIssueStatusSchema = v.picklist([
  "open",
  "in_progress",
  "closed",
])
export const agentIssuePrioritySchema = v.picklist([
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
])

export const agentAccountContextSchema = v.strictObject({
  name: v.pipe(v.string(), v.maxLength(200)),
  profileImage: v.nullable(v.pipe(v.string(), v.maxLength(2_048))),
})

export const agentOrganizationContextSchema = v.strictObject({
  name: v.pipe(v.string(), v.maxLength(200)),
  slug: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  role: agentRoleSchema,
  permissions: v.strictObject({
    canReadIssues: v.literal(true),
    canCreateIssues: v.literal(true),
    canUpdateIssues: v.literal(true),
    canDeleteOwnIssues: v.literal(true),
    canDeleteAnyIssue: v.boolean(),
  }),
})

export const agentMemberSchema = v.strictObject({
  id: agentIdentifierSchema,
  name: v.pipe(v.string(), v.maxLength(200)),
  profileImage: v.nullable(v.pipe(v.string(), v.maxLength(2_048))),
  role: agentRoleSchema,
})

export const agentIssueLabelSchema = v.strictObject({
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
  usageCount: agentNonNegativeIntegerSchema,
})

export const agentIssueSchema = v.strictObject({
  id: agentIdentifierSchema,
  number: agentPositiveIntegerSchema,
  title: agentTitleSchema,
  description: v.pipe(v.string(), v.maxLength(50_000)),
  status: agentIssueStatusSchema,
  priority: agentIssuePrioritySchema,
  assigneeId: v.nullable(agentIdentifierSchema),
  labels: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(40))),
    v.maxLength(20)
  ),
  dueDate: v.nullable(agentIsoTimestampSchema),
  revision: agentPositiveIntegerSchema,
  createdAt: agentIsoTimestampSchema,
  updatedAt: agentIsoTimestampSchema,
})

export const agentIssueAttachmentSchema = v.strictObject({
  id: agentIdentifierSchema,
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  sizeBytes: agentNonNegativeIntegerSchema,
  declaredContentType: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  imageReadable: v.boolean(),
  textPreviewable: v.boolean(),
  dimensions: v.nullable(
    v.strictObject({
      width: agentPositiveIntegerSchema,
      height: agentPositiveIntegerSchema,
    })
  ),
  uploaderName: v.pipe(v.string(), v.maxLength(200)),
  createdAt: agentIsoTimestampSchema,
})

export const agentIssueDetailSchema = v.strictObject({
  ...agentIssueSchema.entries,
  attachments: v.strictObject({
    items: v.pipe(v.array(agentIssueAttachmentSchema), v.maxLength(100)),
    nextCursor: v.nullable(v.pipe(v.string(), v.maxLength(1_024))),
  }),
})

export const agentGetIssueToolOutputSchema = v.strictObject({
  ...agentIssueDetailSchema.entries,
  description: v.pipe(v.string(), v.maxLength(20_000)),
})

export const getIssueToolInputSchema = v.variant("lookup", [
  v.strictObject({
    lookup: v.literal("id"),
    id: agentIdentifierSchema,
    attachmentCursor: v.optional(
      v.pipe(v.string(), v.minLength(1), v.maxLength(1_024))
    ),
    attachmentLimit: v.optional(
      v.pipe(agentPositiveIntegerSchema, v.maxValue(100))
    ),
  }),
  v.strictObject({
    lookup: v.literal("number"),
    number: v.pipe(agentPositiveIntegerSchema, v.maxValue(2_147_483_647)),
    attachmentCursor: v.optional(
      v.pipe(v.string(), v.minLength(1), v.maxLength(1_024))
    ),
    attachmentLimit: v.optional(
      v.pipe(agentPositiveIntegerSchema, v.maxValue(100))
    ),
  }),
])

const attachmentReceiptBaseEntries = {
  actionId: agentIdentifierSchema,
  issueId: agentIdentifierSchema,
  issueNumber: agentPositiveIntegerSchema,
  revision: agentPositiveIntegerSchema,
}
export const agentAttachmentMutationReceiptSchema = v.variant("operation", [
  v.strictObject({
    ...attachmentReceiptBaseEntries,
    operation: v.literal("added"),
    fileIds: v.pipe(
      v.array(agentIdentifierSchema),
      v.minLength(1),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
  }),
  v.strictObject({
    ...attachmentReceiptBaseEntries,
    operation: v.literal("removed"),
    fileIds: v.pipe(
      v.array(agentIdentifierSchema),
      v.minLength(1),
      v.maxLength(20),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
  }),
])

const capabilitySchema = v.pipe(
  v.string(),
  v.minLength(32),
  v.maxLength(512),
  v.regex(/^[A-Za-z0-9._~-]+$/)
)
const modelSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200))
const boundedStringSchema = v.pipe(v.string(), v.maxLength(50_000))
const agentActionTitleSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200)
)
const agentActionLabelsSchema = v.pipe(
  v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))),
  v.maxLength(20)
)
const boundedStringArraySchema = v.pipe(
  v.array(v.pipe(v.string(), v.maxLength(500))),
  v.maxLength(20)
)
const attachmentFilenameSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(255)
)

export const agentConnectionSchema = v.strictObject({
  grant: capabilitySchema,
  expiresAt: agentIsoTimestampSchema,
  memoryResourceId: agentIdentifierSchema,
  user: agentAccountContextSchema,
  organization: agentOrganizationContextSchema,
  thread: v.strictObject({
    id: agentIdentifierSchema,
    title: agentThreadTitleSchema,
  }),
})

export const agentRunGrantSchema = v.strictObject({
  runId: agentIdentifierSchema,
  rootRunId: agentIdentifierSchema,
  attempt: agentPositiveIntegerSchema,
  grant: capabilitySchema,
  expiresAt: agentIsoTimestampSchema,
  shouldGenerateTitle: v.boolean(),
})

export const agentChatRunSchema = v.strictObject({
  memoryResourceId: agentIdentifierSchema,
  user: agentAccountContextSchema,
  organization: agentOrganizationContextSchema,
  thread: v.strictObject({
    id: agentIdentifierSchema,
    title: agentThreadTitleSchema,
  }),
  run: agentRunGrantSchema,
})

export const agentRunResultSchema = v.strictObject({
  runId: agentIdentifierSchema,
  status: v.picklist([
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "canceled",
    "expired",
  ]),
})

export const agentContextRevocationSchema = v.strictObject({
  contextEpoch: agentPositiveIntegerSchema,
})

export const agentRunLivenessSchema = v.strictObject({
  live: v.literal(true),
})

export const agentWebSearchAuthorizationSchema = v.strictObject({
  query: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(200)),
  reserved: v.literal(true),
  reused: v.boolean(),
})

export const agentUsageRecordInputSchema = v.strictObject({
  provider: v.literal("openrouter"),
  model: modelSchema,
  inputTokenCount: agentNonNegativeIntegerSchema,
  inputNoCacheTokenCount: agentNonNegativeIntegerSchema,
  cacheReadTokenCount: agentNonNegativeIntegerSchema,
  cacheWriteTokenCount: agentNonNegativeIntegerSchema,
  outputTokenCount: agentNonNegativeIntegerSchema,
  textOutputTokenCount: agentNonNegativeIntegerSchema,
  reasoningTokenCount: agentNonNegativeIntegerSchema,
  totalTokenCount: agentNonNegativeIntegerSchema,
  imageInputCount: agentNonNegativeIntegerSchema,
  providerCostMicros: v.optional(agentNonNegativeIntegerSchema),
  durationMs: agentNonNegativeIntegerSchema,
  runEventId: agentIdentifierSchema,
})

export const agentIssueActionKindSchema = v.picklist([
  "create_issue",
  "update_issue",
  "delete_issue",
])

export const agentCreateIssueActionInputSchema = v.strictObject({
  title: agentActionTitleSchema,
  description: v.optional(boundedStringSchema),
  status: v.optional(agentIssueStatusSchema),
  priority: v.optional(agentIssuePrioritySchema),
  assigneeId: v.optional(v.nullable(agentIdentifierSchema)),
  labels: v.optional(agentActionLabelsSchema),
  dueDate: v.optional(v.nullable(agentIsoTimestampSchema)),
  attachmentAssetIds: v.optional(
    v.pipe(
      v.array(agentIdentifierSchema),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    )
  ),
})

const agentUpdateIssueActionBaseEntries = {
  issueId: agentIdentifierSchema,
  expectedRevision: agentPositiveIntegerSchema,
}
export const agentUpdateIssueActionInputSchema = v.union([
  v.strictObject({
    ...agentUpdateIssueActionBaseEntries,
    operation: v.optional(v.literal("fields")),
    title: v.optional(agentActionTitleSchema),
    description: v.optional(boundedStringSchema),
    status: v.optional(agentIssueStatusSchema),
    priority: v.optional(agentIssuePrioritySchema),
    assigneeId: v.optional(v.nullable(agentIdentifierSchema)),
    labels: v.optional(agentActionLabelsSchema),
    dueDate: v.optional(v.nullable(agentIsoTimestampSchema)),
  }),
  v.strictObject({
    ...agentUpdateIssueActionBaseEntries,
    operation: v.literal("add_attachments"),
    attachmentAssetIds: v.pipe(
      v.array(agentIdentifierSchema),
      v.minLength(1),
      v.maxLength(4),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
  }),
  v.strictObject({
    ...agentUpdateIssueActionBaseEntries,
    operation: v.literal("remove_attachments"),
    attachmentFileIds: v.pipe(
      v.array(agentIdentifierSchema),
      v.minLength(1),
      v.maxLength(20),
      v.checkItems((item, index, array) => array.indexOf(item) === index)
    ),
  }),
])

export const agentDeleteIssueActionInputSchema = v.strictObject({
  issueId: agentIdentifierSchema,
  expectedRevision: agentPositiveIntegerSchema,
})

const agentIssueActionPreviewValueSchema = v.union([
  boundedStringSchema,
  boundedStringArraySchema,
  v.null(),
])

export const agentIssueActionPreviewSchema = v.strictObject({
  kind: agentIssueActionKindSchema,
  destructive: v.boolean(),
  attachmentOperation: v.nullable(v.picklist(["add", "remove"])),
  title: agentTitleSchema,
  issueNumber: v.nullable(agentPositiveIntegerSchema),
  issueRevision: v.nullable(agentPositiveIntegerSchema),
  fields: v.pipe(
    v.array(
      v.strictObject({
        field: v.picklist([
          "title",
          "description",
          "status",
          "priority",
          "assignee",
          "labels",
          "due_date",
        ]),
        before: agentIssueActionPreviewValueSchema,
        after: agentIssueActionPreviewValueSchema,
      })
    ),
    v.maxLength(20)
  ),
  attachments: v.pipe(
    v.array(
      v.variant("source", [
        v.strictObject({
          source: v.literal("asset"),
          assetId: agentIdentifierSchema,
          filename: attachmentFilenameSchema,
          sizeBytes: agentNonNegativeIntegerSchema,
        }),
        v.strictObject({
          source: v.literal("file"),
          fileId: agentIdentifierSchema,
          filename: attachmentFilenameSchema,
          sizeBytes: agentNonNegativeIntegerSchema,
        }),
      ])
    ),
    v.maxLength(20)
  ),
})

export const agentIssueActionSchema = v.strictObject({
  id: agentIdentifierSchema,
  kind: agentIssueActionKindSchema,
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
  preview: v.nullable(agentIssueActionPreviewSchema),
  previewState: v.picklist(["available", "expired"]),
  expiresAt: agentIsoTimestampSchema,
  completedAt: v.nullable(agentIsoTimestampSchema),
})

const addedAttachmentFileIdsSchema = v.pipe(
  v.array(agentIdentifierSchema),
  v.minLength(1),
  v.maxLength(4),
  v.checkItems((item, index, array) => array.indexOf(item) === index)
)
const removedAttachmentFileIdsSchema = v.pipe(
  v.array(agentIdentifierSchema),
  v.minLength(1),
  v.maxLength(20),
  v.checkItems((item, index, array) => array.indexOf(item) === index)
)
const attachmentMutationSchema = v.variant("operation", [
  v.strictObject({
    operation: v.literal("added"),
    fileIds: addedAttachmentFileIdsSchema,
  }),
  v.strictObject({
    operation: v.literal("removed"),
    fileIds: removedAttachmentFileIdsSchema,
  }),
])

export const agentActionExecutionResultSchema = v.strictObject({
  actionId: agentIdentifierSchema,
  kind: agentIssueActionKindSchema,
  status: v.literal("succeeded"),
  issue: v.strictObject({
    id: agentIdentifierSchema,
    number: agentPositiveIntegerSchema,
    revision: agentPositiveIntegerSchema,
    deleted: v.boolean(),
    attachmentMutation: v.optional(attachmentMutationSchema),
  }),
})

export const agentApprovalPolicySchema = v.strictObject({
  mode: v.picklist(["ask_always", "full_access"]),
  permissions: v.strictObject({
    createIssue: v.boolean(),
    updateIssue: v.boolean(),
    deleteIssue: v.boolean(),
  }),
})

export const agentResumeTicketSchema = v.strictObject({
  ticket: capabilitySchema,
  expiresAt: agentIsoTimestampSchema,
})

export const agentSearchIssuesInputSchema = v.strictObject({
  grant: capabilitySchema,
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  status: v.optional(agentIssueStatusSchema),
  priority: v.optional(agentIssuePrioritySchema),
  assigneeId: v.optional(agentIdentifierSchema),
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
  limit: v.optional(v.pipe(agentPositiveIntegerSchema, v.maxValue(50))),
})

export const agentGetIssueInputSchema = v.variant("lookup", [
  v.strictObject({
    grant: capabilitySchema,
    ...getIssueToolInputSchema.options[0].entries,
  }),
  v.strictObject({
    grant: capabilitySchema,
    ...getIssueToolInputSchema.options[1].entries,
  }),
])

export const agentMemberListSchema = v.pipe(
  v.array(agentMemberSchema),
  v.maxLength(50)
)
export const agentIssueLabelListSchema = v.pipe(
  v.array(agentIssueLabelSchema),
  v.maxLength(50)
)
export const agentIssueListSchema = v.pipe(
  v.array(agentIssueSchema),
  v.maxLength(50)
)
