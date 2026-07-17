import type { Db } from "@enterprise-agentic-saas/db"
import type {
  IssuePriority,
  IssueStatus,
} from "@enterprise-agentic-saas/db/schema"

import { publicErrors } from "../../errors/app-error"
import { getMembership, requireMembership } from "../authorization/roles"
import {
  deleteIssueById,
  deleteIssueCommentById,
  findIssueById,
  findIssueByNumber,
  findIssueCommentById,
  insertIssue,
  insertIssueComment,
  listIssueComments,
  listIssueTimeline,
  listIssuesByOrganization,
  updateIssueById,
  updateIssueCommentById,
  type ListIssuesInput,
} from "./repository"
import { decodeIssueTimelineCursor } from "./timeline-cursor"

const normalizeRequired = (value: string, field: string) => {
  const normalized = value.trim()
  if (!normalized) {
    throw publicErrors.validation(`${field} is required`, { field })
  }
  return normalized
}

const normalizeLabels = (labels: string[]) => {
  const normalized = labels.map((label) => label.trim()).filter(Boolean)
  return [...new Set(normalized)]
}

const parseDueDate = (value: string | null | undefined) => {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw publicErrors.validation("Invalid due date and time", {
      field: "dueDate",
    })
  }
  return date
}

const assertAssigneeMembership = async (
  db: Db,
  input: { assigneeId?: string | null; organizationId: string }
) => {
  if (!input.assigneeId) {
    return
  }
  const membership = await getMembership(db, {
    userId: input.assigneeId,
    organizationId: input.organizationId,
  })
  if (!membership) {
    throw publicErrors.validation(
      "Assignee must be a member of the organization",
      { field: "assigneeId", reason: "not_a_member" }
    )
  }
}

export const listIssues = async (
  db: Db,
  input: ListIssuesInput & { userId: string }
) => {
  await requireMembership(db, input)
  return listIssuesByOrganization(db, input)
}

export const getIssue = async (
  db: Db,
  input: { userId: string; id: string; organizationId: string }
) => {
  await requireMembership(db, input)
  const issue = await findIssueById(db, input)
  if (!issue) {
    throw publicErrors.notFound("Issue not found", { resource: "issue" })
  }
  return issue
}

export const getIssueByNumber = async (
  db: Db,
  input: { userId: string; number: number; organizationId: string }
) => {
  await requireMembership(db, input)
  const issue = await findIssueByNumber(db, input)
  if (!issue) {
    throw publicErrors.notFound("Issue not found", { resource: "issue" })
  }
  return issue
}

export const getIssueTimeline = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    issueId: string
    cursor?: string
    limit?: number
  }
) => {
  await getIssue(db, {
    userId: input.userId,
    id: input.issueId,
    organizationId: input.organizationId,
  })

  let cursor
  try {
    cursor = input.cursor ? decodeIssueTimelineCursor(input.cursor) : undefined
  } catch {
    throw publicErrors.validation("Invalid timeline cursor", {
      field: "cursor",
    })
  }

  return listIssueTimeline(db, {
    organizationId: input.organizationId,
    issueId: input.issueId,
    cursor,
    limit: input.limit ?? 50,
  })
}

export const createIssue = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    title: string
    description?: string
    status?: IssueStatus
    priority?: IssuePriority
    assigneeId?: string | null
    labels?: string[]
    dueDate?: string | null
  }
) => {
  await requireMembership(db, input)
  await assertAssigneeMembership(db, input)

  const issue = await insertIssue(db, {
    organizationId: input.organizationId,
    creatorId: input.userId,
    title: normalizeRequired(input.title, "title"),
    description: input.description?.trim() ?? "",
    status: input.status ?? "open",
    priority: input.priority ?? "no_priority",
    assigneeId: input.assigneeId ?? null,
    labels: normalizeLabels(input.labels ?? []),
    dueDate: parseDueDate(input.dueDate) ?? null,
  })

  return issue
}

export const updateIssue = async (
  db: Db,
  input: {
    userId: string
    id: string
    organizationId: string
    title?: string
    description?: string
    status?: IssueStatus
    priority?: IssuePriority
    assigneeId?: string | null
    labels?: string[]
    dueDate?: string | null
  }
) => {
  await requireMembership(db, input)
  await assertAssigneeMembership(db, input)

  const changes = [
    input.title,
    input.description,
    input.status,
    input.priority,
    input.assigneeId,
    input.labels,
    input.dueDate,
  ]
  if (changes.every((value) => value === undefined)) {
    throw publicErrors.validation("No issue changes provided")
  }

  const issue = await updateIssueById(db, {
    id: input.id,
    actorUserId: input.userId,
    organizationId: input.organizationId,
    title:
      input.title === undefined
        ? undefined
        : normalizeRequired(input.title, "title"),
    description: input.description?.trim(),
    status: input.status,
    priority: input.priority,
    assigneeId: input.assigneeId,
    labels:
      input.labels === undefined ? undefined : normalizeLabels(input.labels),
    dueDate: parseDueDate(input.dueDate),
  })

  if (!issue) {
    throw publicErrors.notFound("Issue not found", { resource: "issue" })
  }

  return issue
}

export const deleteIssue = async (
  db: Db,
  input: { userId: string; id: string; organizationId: string }
) => {
  const membership = await requireMembership(db, input)
  const current = await findIssueById(db, input)
  if (!current) {
    throw publicErrors.notFound("Issue not found", { resource: "issue" })
  }
  if (membership.role === "member" && current.creatorId !== input.userId) {
    throw publicErrors.forbidden("Only the creator or an admin can delete")
  }

  const issue = await deleteIssueById(db, {
    ...input,
    actorUserId: input.userId,
  })
  if (!issue) {
    throw publicErrors.notFound("Issue not found", { resource: "issue" })
  }
  return issue
}

export const getIssueComments = async (
  db: Db,
  input: { userId: string; organizationId: string; issueId: string }
) => {
  await getIssue(db, {
    userId: input.userId,
    id: input.issueId,
    organizationId: input.organizationId,
  })
  return listIssueComments(db, input)
}

export const createIssueComment = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    issueId: string
    body: string
  }
) => {
  await getIssue(db, {
    userId: input.userId,
    id: input.issueId,
    organizationId: input.organizationId,
  })
  const comment = await insertIssueComment(db, {
    organizationId: input.organizationId,
    issueId: input.issueId,
    authorId: input.userId,
    body: normalizeRequired(input.body, "body"),
  })
  return comment
}

export const updateIssueComment = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    issueId: string
    commentId: string
    body: string
  }
) => {
  const membership = await requireMembership(db, input)
  const current = await findIssueCommentById(db, input)
  if (!current) {
    throw publicErrors.notFound("Comment not found", {
      resource: "issue_comment",
    })
  }
  if (membership.role === "member" && current.authorId !== input.userId) {
    throw publicErrors.forbidden("Only the author or an admin can edit")
  }

  const comment = await updateIssueCommentById(db, {
    ...input,
    actorUserId: input.userId,
    body: normalizeRequired(input.body, "body"),
  })
  if (!comment) {
    throw publicErrors.notFound("Comment not found", {
      resource: "issue_comment",
    })
  }
  return comment
}

export const deleteIssueComment = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    issueId: string
    commentId: string
  }
) => {
  const membership = await requireMembership(db, input)
  const current = await findIssueCommentById(db, input)
  if (!current) {
    throw publicErrors.notFound("Comment not found", {
      resource: "issue_comment",
    })
  }
  if (membership.role === "member" && current.authorId !== input.userId) {
    throw publicErrors.forbidden("Only the author or an admin can delete")
  }

  const comment = await deleteIssueCommentById(db, {
    ...input,
    actorUserId: input.userId,
  })
  if (!comment) {
    throw publicErrors.notFound("Comment not found", {
      resource: "issue_comment",
    })
  }
  return comment
}
