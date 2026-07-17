import type { ApiClient } from "@enterprise-agentic-saas/api/client"

import { ConsoleApiError, toConsoleApiError } from "@/features/console/api"
import {
  parseIssue,
  parseIssueComment,
  parseIssueComments,
  parseIssueTimelinePage,
  parseIssues,
  type IssuePriority,
  type IssueStatus,
} from "@/features/issues/schema"

type EdenResult = {
  data: unknown
  error: unknown
  status: number
}

const unwrap = (result: EdenResult): unknown => {
  if (result.error) {
    throw toConsoleApiError(result.error, result.status)
  }

  if (result.data === null || result.data === undefined) {
    throw new ConsoleApiError({
      code: "invalid_response",
      message: "API response did not include data",
      status: result.status,
    })
  }

  return result.data
}

export const listIssues = async (
  client: ApiClient,
  organizationId: string,
  signal?: AbortSignal
) =>
  parseIssues(
    unwrap(
      await client.issues.get({
        query: { organizationId },
        fetch: { signal },
      })
    )
  )

export const createIssue = async (
  client: ApiClient,
  input: {
    organizationId: string
    title: string
    description?: string
    status?: IssueStatus
    priority?: IssuePriority
    assigneeId?: string | null
    labels?: string[]
    dueDate?: string | null
  }
) => parseIssue(unwrap(await client.issues.post(input)))

export const getIssueByNumber = async (
  client: ApiClient,
  input: { number: number; organizationId: string },
  signal?: AbortSignal
) =>
  parseIssue(
    unwrap(
      await client.issues["by-number"]({ number: input.number }).get({
        query: { organizationId: input.organizationId },
        fetch: { signal },
      })
    )
  )

export const getIssueTimeline = async (
  client: ApiClient,
  input: {
    id: string
    organizationId: string
    cursor?: string
    limit?: number
  },
  signal?: AbortSignal
) =>
  parseIssueTimelinePage(
    unwrap(
      await client.issues({ id: input.id }).timeline.get({
        query: {
          organizationId: input.organizationId,
          cursor: input.cursor,
          limit: input.limit,
        },
        fetch: { signal },
      })
    )
  )

export const updateIssue = async (
  client: ApiClient,
  input: {
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
) =>
  parseIssue(
    unwrap(
      await client.issues({ id: input.id }).patch({
        organizationId: input.organizationId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        labels: input.labels,
        dueDate: input.dueDate,
      })
    )
  )

export const deleteIssue = async (
  client: ApiClient,
  input: { id: string; organizationId: string }
) =>
  parseIssue(
    unwrap(
      await client.issues({ id: input.id }).delete({
        organizationId: input.organizationId,
      })
    )
  )

export const listIssueComments = async (
  client: ApiClient,
  input: { id: string; organizationId: string },
  signal?: AbortSignal
) =>
  parseIssueComments(
    unwrap(
      await client.issues({ id: input.id }).comments.get({
        query: { organizationId: input.organizationId },
        fetch: { signal },
      })
    )
  )

export const createIssueComment = async (
  client: ApiClient,
  input: { id: string; organizationId: string; body: string }
) =>
  parseIssueComment(
    unwrap(
      await client.issues({ id: input.id }).comments.post({
        organizationId: input.organizationId,
        body: input.body,
      })
    )
  )

export const updateIssueComment = async (
  client: ApiClient,
  input: {
    id: string
    commentId: string
    organizationId: string
    body: string
  }
) =>
  parseIssueComment(
    unwrap(
      await client
        .issues({ id: input.id })
        .comments({ commentId: input.commentId })
        .patch({
          organizationId: input.organizationId,
          body: input.body,
        })
    )
  )

export const deleteIssueComment = async (
  client: ApiClient,
  input: { id: string; commentId: string; organizationId: string }
) =>
  parseIssueComment(
    unwrap(
      await client
        .issues({ id: input.id })
        .comments({ commentId: input.commentId })
        .delete({ organizationId: input.organizationId })
    )
  )
