import { HttpError } from "../../errors/http-error"
import { createObservedLogger } from "../../platform/observability/runtime"
import type { IssuePriority, IssueStatus, ListIssuesInput } from "./domain"
import {
  normalizeIssueLabels,
  normalizeIssueRequiredText,
  parseIssueDueDate,
} from "./normalizers"
import type { IssuesPorts } from "./ports"
import { decodeIssueTimelineCursor } from "./timeline-cursor"

const issueListLogger = createObservedLogger("issues").child("list")

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
      throw new HttpError({
        code: "validation_error",
        fieldErrors: {
          assigneeId: ["Choose a member of this organization."],
        },
        publicMessage: "The assignee must be an organization member.",
      })
    }
  }

  const listIssues = async (
    input: Omit<ListIssuesInput, "limit"> & {
      page: number
      userId: string
    }
  ) => {
    await ports.requireMembership(input)
    const result = await ports.listIssues(input)
    issueListLogger.info("Issue list resolved", {
      "app.operation": "listIssues",
      "app.outcome": "success",
      "issue.result_count": result.items.length,
      "issue.total_count": result.total,
      "issue.page": result.page,
      "issue.page_size": result.pageSize,
      "issue.filter.has_search": Boolean(input.search?.trim()),
      "issue.filter.status_count":
        input.statuses?.length ?? (input.status ? 1 : 0),
      "issue.filter.assignee_count":
        input.assigneeIds?.length ?? (input.assigneeId ? 1 : 0),
      "issue.filter.label_count": input.labels?.length ?? (input.label ? 1 : 0),
      "issue.filter.has_priority_range": Boolean(
        input.priorityFrom || input.priorityTo
      ),
      "issue.filter.has_due_date_range": Boolean(
        input.dueDateFrom || input.dueDateTo
      ),
      "issue.sort_by": input.sortBy ?? "default",
      "issue.sort_direction": input.sortDirection ?? "default",
    })
    return result
  }

  const listLabels = async (input: {
    organizationId: string
    search?: string
    userId: string
  }) => {
    await ports.requireMembership(input)
    return {
      items: await ports.listLabels({
        organizationId: input.organizationId,
        search: input.search?.trim(),
      }),
    }
  }

  const getIssue = async (input: {
    id: string
    organizationId: string
    userId: string
  }) => {
    await ports.requireMembership(input)
    const issue = await ports.findIssue(input)
    if (!issue) {
      throw new HttpError({ code: "not_found" })
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
      throw new HttpError({ code: "not_found" })
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
    } catch (cause) {
      throw new HttpError({
        code: "validation_error",
        cause,
        fieldErrors: { cursor: ["The cursor is invalid."] },
        publicMessage: "The timeline cursor is invalid.",
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
    listLabels,
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
      title: normalizeIssueRequiredText(input.title, "title"),
      description: input.description?.trim() ?? "",
      status: input.status ?? "open",
      priority: input.priority ?? "no_priority",
      assigneeId: input.assigneeId ?? null,
      labels: normalizeIssueLabels(input.labels ?? []),
      dueDate: parseIssueDueDate(input.dueDate) ?? null,
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
      throw new HttpError({
        code: "validation_error",
        publicMessage: "Provide at least one issue change.",
      })
    }

    const issue = await ports.updateIssue({
      id: input.id,
      actorUserId: input.userId,
      organizationId: input.organizationId,
      title:
        input.title === undefined
          ? undefined
          : normalizeIssueRequiredText(input.title, "title"),
      description: input.description?.trim(),
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId,
      labels:
        input.labels === undefined
          ? undefined
          : normalizeIssueLabels(input.labels),
      dueDate: parseIssueDueDate(input.dueDate),
    })

    if (!issue) {
      throw new HttpError({ code: "not_found" })
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
      throw new HttpError({ code: "not_found" })
    }
    if (membership.role === "member" && current.creatorId !== input.userId) {
      throw new HttpError({ code: "forbidden" })
    }

    const issue = await ports.deleteIssue({
      id: input.id,
      organizationId: input.organizationId,
      actorUserId: input.userId,
    })
    if (!issue) {
      throw new HttpError({ code: "not_found" })
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
      body: normalizeIssueRequiredText(input.body, "body"),
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
      throw new HttpError({ code: "not_found" })
    }
    if (membership.role === "member" && current.authorId !== input.userId) {
      throw new HttpError({ code: "forbidden" })
    }

    const comment = await ports.updateComment({
      organizationId: input.organizationId,
      issueId: input.issueId,
      commentId: input.commentId,
      actorUserId: input.userId,
      body: normalizeIssueRequiredText(input.body, "body"),
    })
    if (!comment) {
      throw new HttpError({ code: "not_found" })
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
      throw new HttpError({ code: "not_found" })
    }
    if (membership.role === "member" && current.authorId !== input.userId) {
      throw new HttpError({ code: "forbidden" })
    }

    const comment = await ports.deleteComment({
      organizationId: input.organizationId,
      issueId: input.issueId,
      commentId: input.commentId,
      actorUserId: input.userId,
    })
    if (!comment) {
      throw new HttpError({ code: "not_found" })
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
      throw new HttpError({ code: "not_found" })
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
