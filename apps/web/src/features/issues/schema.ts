import type { ApiClient, Treaty } from "@enterprise-agentic-saas/api/client"
import * as v from "valibot"

const issueStatusSchema = v.picklist(["open", "in_progress", "closed"])

const issuePrioritySchema = v.picklist([
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
])

const nullableIdentifierSchema = v.nullable(v.string())
const dueDateSchema = v.pipe(
  v.string(),
  v.isoTimestamp("Due date and time must be a valid ISO timestamp.")
)

export const createIssueFormSchema = v.object({
  title: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter an issue title."),
    v.maxLength(200, "Use 200 characters or fewer.")
  ),
})

const updateIssueFormSchema = v.object({
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

type IssueRoutes = ReturnType<ApiClient["issues"]>

export type Issue = Treaty.Data<ApiClient["issues"]["post"]>
export type IssueListPage = Treaty.Data<ApiClient["issues"]["get"]>
export type IssueListItem = IssueListPage["items"][number]
export type IssueStatus = v.InferOutput<typeof issueStatusSchema>
export type IssuePriority = v.InferOutput<typeof issuePrioritySchema>
export type IssueComment = Treaty.Data<IssueRoutes["comments"]["post"]>
export type IssueTimelinePage = Treaty.Data<IssueRoutes["timeline"]["get"]>
export type IssueTimelineItem = IssueTimelinePage["items"][number]
export type IssueActivity = Extract<IssueTimelineItem, { type: "activity" }>
export type UpdateIssueFormValues = v.InferOutput<typeof updateIssueFormSchema>
