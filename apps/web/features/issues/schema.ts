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
  v.isoTimestamp("Due date and time must be a valid ISO timestamp.")
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
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  createdAt: apiTimestampSchema,
  updatedAt: apiTimestampSchema,
})

export const issueCommentSchema = v.object({
  id: v.string(),
  organizationId: v.string(),
  issueId: v.string(),
  authorId: v.string(),
  author: v.object({
    id: v.string(),
    name: v.string(),
    profileImage: v.nullable(v.string()),
  }),
  body: v.string(),
  createdAt: apiTimestampSchema,
  updatedAt: apiTimestampSchema,
})

export const issueListPageSchema = v.object({
  items: v.array(issueSchema),
  page: v.pipe(v.number(), v.integer(), v.minValue(1)),
  pageSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
  total: v.pipe(v.number(), v.integer(), v.minValue(0)),
})
export const issueCommentListSchema = v.array(issueCommentSchema)

const issueActivityValueSchema = v.union([
  v.string(),
  v.array(v.string()),
  v.null(),
])

export const issueActivitySchema = v.object({
  type: v.literal("activity"),
  id: v.string(),
  kind: v.picklist([
    "created",
    "field_changed",
    "legacy_updated",
    "file_added",
    "file_deleted",
  ]),
  field: v.nullable(
    v.picklist([
      "title",
      "description",
      "status",
      "priority",
      "assignee",
      "labels",
      "due_date",
    ])
  ),
  fromValue: issueActivityValueSchema,
  toValue: issueActivityValueSchema,
  actor: v.object({
    id: v.nullable(v.string()),
    name: v.string(),
    profileImage: v.nullable(v.string()),
  }),
  createdAt: apiTimestampSchema,
})

export const issueTimelineCommentSchema = v.object({
  type: v.literal("comment"),
  ...issueCommentSchema.entries,
})

export const issueTimelinePageSchema = v.object({
  items: v.array(v.union([issueActivitySchema, issueTimelineCommentSchema])),
  nextCursor: v.nullable(v.string()),
})

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

export const issueTitleFormSchema = v.object({
  title: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter an issue title."),
    v.maxLength(200, "Use 200 characters or fewer.")
  ),
})

export const issueDescriptionFormSchema = v.object({
  description: v.pipe(
    v.string(),
    v.maxLength(10_000, "Use 10,000 characters or fewer.")
  ),
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
export type IssueListPage = v.InferOutput<typeof issueListPageSchema>
export type IssueStatus = v.InferOutput<typeof issueStatusSchema>
export type IssuePriority = v.InferOutput<typeof issuePrioritySchema>
export type IssueComment = v.InferOutput<typeof issueCommentSchema>
export type IssueActivity = v.InferOutput<typeof issueActivitySchema>
export type IssueTimelineItem = v.InferOutput<
  typeof issueTimelinePageSchema
>["items"][number]
export type IssueTimelinePage = v.InferOutput<typeof issueTimelinePageSchema>
export type CreateIssueFormValues = v.InferOutput<typeof createIssueFormSchema>
export type UpdateIssueFormValues = v.InferOutput<typeof updateIssueFormSchema>

export const parseIssue = (value: unknown) => v.parse(issueSchema, value)
export const parseIssueListPage = (value: unknown) =>
  v.parse(issueListPageSchema, value)
export const parseIssueComment = (value: unknown) =>
  v.parse(issueCommentSchema, value)
export const parseIssueComments = (value: unknown) =>
  v.parse(issueCommentListSchema, value)
export const parseIssueTimelinePage = (value: unknown) =>
  v.parse(issueTimelinePageSchema, value)
