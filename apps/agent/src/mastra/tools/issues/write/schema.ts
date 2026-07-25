import { z } from "zod"

export const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const identifierSchema = z.string().trim().regex(IDENTIFIER_PATTERN)
const optionalAssigneeSchema = z
  .union([identifierSchema, z.literal(""), z.null()])
  .optional()
  .describe(
    "Organization member ID. Omit this field or use null when the Issue is unassigned; never use an empty string."
  )
const issueStatusSchema = z.enum(["open", "in_progress", "closed"])
const issuePrioritySchema = z.enum([
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
])
const dueDateSchema = z.iso.datetime({ offset: true })
const labelsSchema = z.array(z.string().trim().min(1).max(40)).max(20)
const attachmentAssetIdsSchema = z
  .array(identifierSchema)
  .max(4)
  .optional()
  .describe(
    "Current-message attachment asset IDs to promote into permanent Issue attachments. When the user asks to attach a current image, pass every exact ID supplied in the current message; otherwise omit this field."
  )

const mutableIssueFields = {
  assigneeId: optionalAssigneeSchema,
  description: z.string().max(50_000).optional(),
  dueDate: dueDateSchema.nullable().optional(),
  labels: labelsSchema.optional(),
  priority: issuePrioritySchema.optional(),
  status: issueStatusSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
}

const createIssueSchema = z
  .object({
    ...mutableIssueFields,
    attachmentAssetIds: attachmentAssetIdsSchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict()

const updateIssueSchema = z
  .object({
    ...mutableIssueFields,
    expectedRevision: z.number().int().min(1),
    issueId: identifierSchema,
  })
  .strict()
  .refine(
    (input) =>
      [
        "assigneeId",
        "description",
        "dueDate",
        "labels",
        "priority",
        "status",
        "title",
      ].some((field) => Object.hasOwn(input, field)),
    { message: "At least one Issue field must change" }
  )

export const deleteIssueSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    issueId: identifierSchema,
  })
  .strict()

export const agentWriteToolSchemas = {
  createIssue: createIssueSchema,
  deleteIssue: deleteIssueSchema,
  updateIssue: updateIssueSchema,
}
