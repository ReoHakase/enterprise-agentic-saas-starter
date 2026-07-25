import { z } from "zod"

const DEFAULT_RESULT_LIMIT = 20
const MAX_RESULT_LIMIT = 50

const emptyInputSchema = z.object({}).strict()

export const searchInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULT_LIMIT)
      .default(DEFAULT_RESULT_LIMIT),
    query: z.string().trim().max(200).optional(),
  })
  .strict()

export const labelSearchInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULT_LIMIT)
      .default(DEFAULT_RESULT_LIMIT),
    query: z.string().trim().max(40).optional(),
  })
  .strict()

export const issueSearchInputSchema = z
  .object({
    assigneeId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    label: z.string().trim().max(40).optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULT_LIMIT)
      .default(DEFAULT_RESULT_LIMIT),
    priority: z
      .enum(["no_priority", "low", "medium", "high", "urgent"])
      .optional(),
    search: z.string().trim().max(200).optional(),
    sortBy: z
      .enum([
        "number",
        "createdAt",
        "updatedAt",
        "dueDate",
        "priority",
        "status",
      ])
      .optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
    status: z.enum(["open", "in_progress", "closed"]).optional(),
  })
  .strict()

export const getIssueInputSchema = z.discriminatedUnion("lookup", [
  z
    .object({
      attachmentCursor: z.string().min(1).max(1024).optional(),
      attachmentLimit: z.number().int().min(1).max(100).optional(),
      id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
      lookup: z.literal("id"),
    })
    .strict(),
  z
    .object({
      attachmentCursor: z.string().min(1).max(1024).optional(),
      attachmentLimit: z.number().int().min(1).max(100).optional(),
      lookup: z.literal("number"),
      number: z.number().int().positive().max(2_147_483_647),
    })
    .strict(),
])

export const issueAttachmentImageInputSchema = z
  .object({
    issueId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    fileId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  })
  .strict()

const issueAttachmentImageResultSchema = z
  .object({
    issueId: z.string(),
    fileId: z.string(),
    contentType: z.literal("image/webp"),
    sizeBytes: z
      .number()
      .int()
      .min(0)
      .max(4 * 1024 * 1024),
  })
  .strict()

export type AgentIssueAttachmentImageResult = z.infer<
  typeof issueAttachmentImageResultSchema
>

export const agentReadToolSchemas = {
  empty: emptyInputSchema,
  getIssue: getIssueInputSchema,
  issueAttachmentImage: issueAttachmentImageInputSchema,
  issueAttachmentImageResult: issueAttachmentImageResultSchema,
  issueSearch: issueSearchInputSchema,
  labelSearch: labelSearchInputSchema,
  memberSearch: searchInputSchema,
}
