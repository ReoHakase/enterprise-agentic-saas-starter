import { z } from "zod"

const boundedString = (maximum: number) => z.string().max(maximum)
const formIdentifier = z.string().min(1).max(128)
const issueRevision = z.number().int().min(1)
const formTarget = {
  expectedEpoch: formIdentifier.optional(),
  expectedRevision: issueRevision.optional(),
  formId: formIdentifier.optional(),
}

const issueQuerySchema = z
  .object({
    assignee: boundedString(128).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
    label: boundedString(40).optional(),
    page: z.number().int().min(1).max(100_000).optional(),
    priority: z
      .enum(["all", "no_priority", "low", "medium", "high", "urgent"])
      .optional(),
    q: boundedString(200).optional(),
    sort: z
      .enum([
        "number",
        "createdAt",
        "updatedAt",
        "dueDate",
        "priority",
        "status",
      ])
      .optional(),
    status: z.enum(["all", "open", "in_progress", "closed"]).optional(),
  })
  .strict()

export const agentClientToolSchemas = {
  navigate: z
    .object({ page: z.enum(["dashboard", "issues", "agent", "members"]) })
    .strict(),
  openIssue: z.object({ issueNumber: z.number().int().min(1) }).strict(),
  patchFormDraft: z
    .object({
      expectedEpoch: formIdentifier,
      expectedRevision: issueRevision,
      formId: formIdentifier,
      patch: z
        .object({
          description: z.string().optional(),
          title: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
  readFormDraft: z.object(formTarget).strict(),
  setIssueQuery: z.object({ query: issueQuerySchema }).strict(),
}
