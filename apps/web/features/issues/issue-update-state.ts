import type { Issue, UpdateIssueFormValues } from "./schema"

type IssueUpdate = Partial<UpdateIssueFormValues>

export const issueUpdateFields = [
  "title",
  "description",
  "status",
  "priority",
  "assigneeId",
  "labels",
  "dueDate",
] as const satisfies readonly (keyof IssueUpdate)[]

export type IssueUpdateField = (typeof issueUpdateFields)[number]

export const getIssueUpdateFields = (update: IssueUpdate) =>
  issueUpdateFields.filter((field) => update[field] !== undefined)

export const mergeIssueUpdateResponse = (
  current: Issue,
  updated: Issue,
  update: IssueUpdate
): Issue => ({
  ...current,
  ...(update.title !== undefined ? { title: updated.title } : {}),
  ...(update.description !== undefined
    ? { description: updated.description }
    : {}),
  ...(update.status !== undefined ? { status: updated.status } : {}),
  ...(update.priority !== undefined ? { priority: updated.priority } : {}),
  ...(update.assigneeId !== undefined
    ? { assigneeId: updated.assigneeId }
    : {}),
  ...(update.labels !== undefined ? { labels: updated.labels } : {}),
  ...(update.dueDate !== undefined ? { dueDate: updated.dueDate } : {}),
  revision: updated.revision,
  updatedAt: updated.updatedAt,
})
