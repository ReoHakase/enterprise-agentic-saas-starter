import * as v from "valibot"

export const issueStatusSchema = v.picklist(["open", "in_progress", "closed"])

export const issuePrioritySchema = v.picklist([
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
])

const nullableIdentifierSchema = v.nullable(v.string())
const apiTimestampSchema = v.pipe(v.string(), v.isoTimestamp())
const dueDateSchema = v.pipe(
  v.string(),
  v.isoDate("Due dates must use YYYY-MM-DD format.")
)

export const issueSchema = v.object({
  id: v.string(),
  organizationId: v.string(),
  number: v.pipe(v.number(), v.integer()),
  title: v.string(),
  description: v.string(),
  status: issueStatusSchema,
  priority: issuePrioritySchema,
  assigneeId: nullableIdentifierSchema,
  creatorId: v.string(),
  labels: v.array(v.string()),
  dueDate: v.nullable(dueDateSchema),
  createdAt: apiTimestampSchema,
  updatedAt: apiTimestampSchema,
})

export const issueCommentSchema = v.object({
  id: v.string(),
  organizationId: v.string(),
  todoId: v.string(),
  authorId: v.string(),
  author: v.object({
    id: v.string(),
    name: v.string(),
    image: v.nullable(v.string()),
  }),
  body: v.string(),
  createdAt: apiTimestampSchema,
  updatedAt: apiTimestampSchema,
})

export const issueListSchema = v.array(issueSchema)
export const issueCommentListSchema = v.array(issueCommentSchema)

export const createIssueFormSchema = v.object({
  title: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter an issue title."),
    v.maxLength(200, "Use 200 characters or fewer.")
  ),
})

export const updateIssueFormSchema = v.object({
  title: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter an issue title."),
    v.maxLength(200, "Use 200 characters or fewer.")
  ),
  description: v.pipe(
    v.string(),
    v.maxLength(10_000, "Use 10,000 characters or fewer.")
  ),
  status: issueStatusSchema,
  priority: issuePrioritySchema,
  assigneeId: nullableIdentifierSchema,
  labels: v.array(v.pipe(v.string(), v.trim(), v.minLength(1))),
  dueDate: v.nullable(dueDateSchema),
})

export const commentFormSchema = v.object({
  body: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter a comment."),
    v.maxLength(10_000, "Use 10,000 characters or fewer.")
  ),
})

export type Issue = v.InferOutput<typeof issueSchema>
export type IssueStatus = v.InferOutput<typeof issueStatusSchema>
export type IssuePriority = v.InferOutput<typeof issuePrioritySchema>
export type IssueComment = v.InferOutput<typeof issueCommentSchema>
export type CreateIssueFormValues = v.InferOutput<typeof createIssueFormSchema>
export type UpdateIssueFormValues = v.InferOutput<typeof updateIssueFormSchema>

export const parseIssue = (value: unknown) => v.parse(issueSchema, value)
export const parseIssues = (value: unknown) => v.parse(issueListSchema, value)
export const parseIssueComment = (value: unknown) =>
  v.parse(issueCommentSchema, value)
export const parseIssueComments = (value: unknown) =>
  v.parse(issueCommentListSchema, value)

export const parseDueDateInput = (value: unknown) => {
  if (typeof value !== "string" || value.length === 0) {
    return ""
  }

  return value.slice(0, 10)
}
