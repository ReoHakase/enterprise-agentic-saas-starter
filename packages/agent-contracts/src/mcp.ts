import * as v from "valibot"

import {
  agentIdentifierSchema,
  agentNonNegativeIntegerSchema,
  agentOrganizationContextSchema,
  agentPositiveIntegerSchema,
} from "./schemas"

export const mcpToolErrorCodes = [
  "conflict",
  "forbidden",
  "not_found",
  "rate_limited",
  "retryable_internal",
  "validation_error",
] as const
export type McpToolErrorCode = (typeof mcpToolErrorCodes)[number]

export class McpToolError extends Error {
  readonly code: McpToolErrorCode

  constructor(code: McpToolErrorCode, options?: ErrorOptions) {
    super(code, options)
    this.name = "McpToolError"
    this.code = code
  }
}

export const mcpOrganizationContextSchema = v.strictObject({
  ...agentOrganizationContextSchema.entries,
  permissions: v.strictObject({
    canReadIssues: v.boolean(),
    canCreateIssues: v.boolean(),
    canUpdateIssues: v.boolean(),
    canDeleteOwnIssues: v.boolean(),
    canDeleteAnyIssue: v.boolean(),
  }),
})
import {
  addIssueAttachmentsToolInputSchema,
  createIssueToolInputSchema,
  deleteIssueToolInputSchema,
  removeIssueAttachmentsToolInputSchema,
  updateIssueToolInputSchema,
} from "./tools"

export const mcpBusinessIdempotencyKeySchema = v.pipe(
  v.string(),
  v.minLength(16),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9._~-]+$/)
)

const withIdempotencyKey = {
  idempotencyKey: mcpBusinessIdempotencyKeySchema,
}

export const mcpCreateIssueToolInputSchema = v.strictObject({
  ...createIssueToolInputSchema.entries,
  ...withIdempotencyKey,
})
export const mcpUpdateIssueToolInputSchema = v.strictObject({
  ...updateIssueToolInputSchema.entries,
  ...withIdempotencyKey,
})
export const mcpDeleteIssueToolInputSchema = v.strictObject({
  ...deleteIssueToolInputSchema.entries,
  ...withIdempotencyKey,
})
export const mcpAddIssueAttachmentsToolInputSchema = v.strictObject({
  ...addIssueAttachmentsToolInputSchema.entries,
  ...withIdempotencyKey,
})
export const mcpRemoveIssueAttachmentsToolInputSchema = v.strictObject({
  ...removeIssueAttachmentsToolInputSchema.entries,
  ...withIdempotencyKey,
})

const mcpAttachmentMutationSchema = v.variant("operation", [
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

export const mcpIssueWriteReceiptSchema = v.strictObject({
  operationId: agentIdentifierSchema,
  replayed: v.boolean(),
  issue: v.strictObject({
    id: agentIdentifierSchema,
    number: agentPositiveIntegerSchema,
    revision: agentPositiveIntegerSchema,
    deleted: v.boolean(),
    attachmentMutation: v.optional(mcpAttachmentMutationSchema),
  }),
})

export const mcpCreateAttachmentUploadSessionToolInputSchema = v.strictObject({
  declaredContentType: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  idempotencyKey: mcpBusinessIdempotencyKeySchema,
  sizeBytes: v.pipe(agentPositiveIntegerSchema, v.maxValue(20_000_000)),
})

export const mcpCreateAttachmentUploadSessionToolOutputSchema = v.strictObject({
  expiresAt: v.pipe(v.string(), v.isoTimestamp(), v.maxLength(40)),
  replayed: v.boolean(),
  uploadId: agentIdentifierSchema,
  uploadUrl: v.pipe(v.string(), v.url(), v.maxLength(2_048)),
})

export const mcpGetAttachmentUploadStatusToolInputSchema = v.strictObject({
  uploadId: agentIdentifierSchema,
})

export const mcpGetAttachmentUploadStatusToolOutputSchema = v.strictObject({
  assetId: v.nullable(agentIdentifierSchema),
  expiresAt: v.pipe(v.string(), v.isoTimestamp(), v.maxLength(40)),
  sizeBytes: agentNonNegativeIntegerSchema,
  status: v.picklist(["pending", "ready", "consumed", "expired"]),
  uploadId: agentIdentifierSchema,
})

export type McpCreateIssueToolInput = v.InferOutput<
  typeof mcpCreateIssueToolInputSchema
>
export type McpOrganizationContext = v.InferOutput<
  typeof mcpOrganizationContextSchema
>
export type McpUpdateIssueToolInput = v.InferOutput<
  typeof mcpUpdateIssueToolInputSchema
>
export type McpDeleteIssueToolInput = v.InferOutput<
  typeof mcpDeleteIssueToolInputSchema
>
export type McpAddIssueAttachmentsToolInput = v.InferOutput<
  typeof mcpAddIssueAttachmentsToolInputSchema
>
export type McpRemoveIssueAttachmentsToolInput = v.InferOutput<
  typeof mcpRemoveIssueAttachmentsToolInputSchema
>
export type McpIssueWriteReceipt = v.InferOutput<
  typeof mcpIssueWriteReceiptSchema
>
export type McpCreateAttachmentUploadSessionToolInput = v.InferOutput<
  typeof mcpCreateAttachmentUploadSessionToolInputSchema
>
export type McpCreateAttachmentUploadSessionToolOutput = v.InferOutput<
  typeof mcpCreateAttachmentUploadSessionToolOutputSchema
>
export type McpGetAttachmentUploadStatusToolInput = v.InferOutput<
  typeof mcpGetAttachmentUploadStatusToolInputSchema
>
export type McpGetAttachmentUploadStatusToolOutput = v.InferOutput<
  typeof mcpGetAttachmentUploadStatusToolOutputSchema
>
