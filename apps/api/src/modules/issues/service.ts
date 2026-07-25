import { publicErrors } from "../../errors/app-error"
import type { IssuePriority, IssueStatus, ListIssuesInput } from "./domain"
import type { IssuesPorts } from "./ports"
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
  if (value === undefined) return undefined
  if (value === null) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw publicErrors.validation("Invalid due date and time", {
      field: "dueDate",
    })
  }
  return date
}

const createIssueReadService = (ports: IssuesPorts) => {
  const assertAssigneeMembership = async (input: {
    assigneeId?: string | null
    organizationId: string
  }) => {
    if (!input.assigneeId) return
    const membership = await ports.getMembership({
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

  const listIssues = async (
    input: Omit<ListIssuesInput, "limit"> & {
      page: number
      userId: string
    }
  ) => {
    await ports.requireMembership(input)
    return ports.listIssues(input)
  }

  const getIssue = async (input: {
    id: string
    organizationId: string
    userId: string
  }) => {
    await ports.requireMembership(input)
    const issue = await ports.findIssue(input)
    if (!issue) {
      throw publicErrors.notFound("Issue not found", { resource: "issue" })
    }
    return issue
  }

  const getIssueByNumber = async (input: {
    number: number
    organizationId: string
    userId: string
  }) => {
    await ports.requireMembership(input)
    const issue = await ports.findIssueByNumber(input)
    if (!issue) {
      throw publicErrors.notFound("Issue not found", { resource: "issue" })
    }
    return issue
  }

  const getIssueThumbnail = async (input: {
    issueId: string
    organizationId: string
    userId: string
  }) => {
    await getIssue({
      userId: input.userId,
      id: input.issueId,
      organizationId: input.organizationId,
    })
    return ports.getThumbnail(input)
  }

  const getIssueTimeline = async (input: {
    cursor?: string
    issueId: string
    limit?: number
    organizationId: string
    userId: string
  }) => {
    await getIssue({
      userId: input.userId,
      id: input.issueId,
      organizationId: input.organizationId,
    })

    let cursor
    try {
      cursor = input.cursor
        ? decodeIssueTimelineCursor(input.cursor)
        : undefined
    } catch {
      throw publicErrors.validation("Invalid timeline cursor", {
        field: "cursor",
      })
    }

    return ports.listTimeline({
      organizationId: input.organizationId,
      issueId: input.issueId,
      cursor,
      limit: input.limit ?? 50,
    })
  }

  return {
    assertAssigneeMembership,
    getIssue,
    getIssueByNumber,
    getIssueThumbnail,
    getIssueTimeline,
    listIssues,
  }
}

const createIssueMutationService = (
  ports: IssuesPorts,
  readService: ReturnType<typeof createIssueReadService>
) => {
  const { assertAssigneeMembership, getIssue } = readService

  const createIssue = async (input: {
    assigneeId?: string | null
    description?: string
    dueDate?: string | null
    labels?: string[]
    organizationId: string
    priority?: IssuePriority
    status?: IssueStatus
    title: string
    userId: string
  }) => {
    await ports.requireMembership(input)
    await assertAssigneeMembership(input)

    return ports.insertIssue({
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
  }

  const updateIssue = async (input: {
    assigneeId?: string | null
    description?: string
    dueDate?: string | null
    id: string
    labels?: string[]
    organizationId: string
    priority?: IssuePriority
    status?: IssueStatus
    title?: string
    userId: string
  }) => {
    await ports.requireMembership(input)
    await assertAssigneeMembership(input)

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

    const issue = await ports.updateIssue({
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

  const deleteIssue = async (input: {
    id: string
    organizationId: string
    userId: string
  }) => {
    const membership = await ports.requireMembership(input)
    const current = await ports.findIssue(input)
    if (!current) {
      throw publicErrors.notFound("Issue not found", { resource: "issue" })
    }
    if (membership.role === "member" && current.creatorId !== input.userId) {
      throw publicErrors.forbidden("Only the creator or an admin can delete")
    }

    const issue = await ports.deleteIssue({
      id: input.id,
      organizationId: input.organizationId,
      actorUserId: input.userId,
    })
    if (!issue) {
      throw publicErrors.notFound("Issue not found", { resource: "issue" })
    }
    return issue
  }

  const getIssueComments = async (input: {
    issueId: string
    organizationId: string
    userId: string
  }) => {
    await getIssue({
      userId: input.userId,
      id: input.issueId,
      organizationId: input.organizationId,
    })
    return ports.listComments(input)
  }

  const createIssueComment = async (input: {
    body: string
    issueId: string
    organizationId: string
    userId: string
  }) => {
    await getIssue({
      userId: input.userId,
      id: input.issueId,
      organizationId: input.organizationId,
    })
    return ports.insertComment({
      organizationId: input.organizationId,
      issueId: input.issueId,
      authorId: input.userId,
      body: normalizeRequired(input.body, "body"),
    })
  }

  const updateIssueComment = async (input: {
    body: string
    commentId: string
    issueId: string
    organizationId: string
    userId: string
  }) => {
    const membership = await ports.requireMembership(input)
    const current = await ports.findComment(input)
    if (!current) {
      throw publicErrors.notFound("Comment not found", {
        resource: "issue_comment",
      })
    }
    if (membership.role === "member" && current.authorId !== input.userId) {
      throw publicErrors.forbidden("Only the author or an admin can edit")
    }

    const comment = await ports.updateComment({
      organizationId: input.organizationId,
      issueId: input.issueId,
      commentId: input.commentId,
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

  const deleteIssueComment = async (input: {
    commentId: string
    issueId: string
    organizationId: string
    userId: string
  }) => {
    const membership = await ports.requireMembership(input)
    const current = await ports.findComment(input)
    if (!current) {
      throw publicErrors.notFound("Comment not found", {
        resource: "issue_comment",
      })
    }
    if (membership.role === "member" && current.authorId !== input.userId) {
      throw publicErrors.forbidden("Only the author or an admin can delete")
    }

    const comment = await ports.deleteComment({
      organizationId: input.organizationId,
      issueId: input.issueId,
      commentId: input.commentId,
      actorUserId: input.userId,
    })
    if (!comment) {
      throw publicErrors.notFound("Comment not found", {
        resource: "issue_comment",
      })
    }
    return comment
  }

  const updateIssueThumbnail = async (input: {
    fileId: string | null
    issueId: string
    organizationId: string
    userId: string
  }) => {
    await ports.requireMembership(input)
    const thumbnail = await ports.setThumbnail({
      actorUserId: input.userId,
      fileId: input.fileId,
      issueId: input.issueId,
      organizationId: input.organizationId,
    })
    if (!thumbnail) {
      throw publicErrors.notFound("Issue not found", { resource: "issue" })
    }
    return thumbnail
  }

  return {
    createIssue,
    createIssueComment,
    deleteIssue,
    deleteIssueComment,
    getIssueComments,
    updateIssue,
    updateIssueComment,
    updateIssueThumbnail,
  }
}

export const createIssuesService = (ports: IssuesPorts) => {
  const readService = createIssueReadService(ports)
  return {
    ...readService,
    ...createIssueMutationService(ports, readService),
  }
}

export type IssuesService = ReturnType<typeof createIssuesService>
