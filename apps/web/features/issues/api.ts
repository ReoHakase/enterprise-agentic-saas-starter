import type { ApiClient } from "@enterprise-agentic-saas/api/client"

import {
  ConsoleApiError,
  toConsoleApiError,
} from "@/features/console/api.public"

import {
  parseIssue,
  parseIssueComment,
  parseIssueTimelinePage,
  parseIssueThumbnail,
  parseIssueListPage,
  type IssueListItem,
  type IssueListPage,
  type IssuePriority,
  type IssueStatus,
} from "./schema"
import {
  defaultIssueSearchState,
  toIssueListRequest,
  type IssueListRequest,
} from "./search-params.shared"

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

export function listIssues(
  client: ApiClient,
  organizationId: string,
  signal?: AbortSignal
): Promise<IssueListItem[]>
export function listIssues(
  client: ApiClient,
  input: IssueListRequest,
  signal?: AbortSignal
): Promise<IssueListPage>
export async function listIssues(
  client: ApiClient,
  input: string | IssueListRequest,
  signal?: AbortSignal
) {
  const request =
    typeof input === "string"
      ? toIssueListRequest(input, defaultIssueSearchState)
      : input
  const page = parseIssueListPage(
    unwrap(
      await client.issues.get({
        query: request,
        fetch: { signal },
      })
    )
  )
  return typeof input === "string" ? page.items : page
}

export const getIssueThumbnail = async (
  client: ApiClient,
  input: { id: string; organizationId: string },
  signal?: AbortSignal
) =>
  parseIssueThumbnail(
    unwrap(
      await client.issues({ id: input.id }).thumbnail.get({
        query: { organizationId: input.organizationId },
        fetch: { signal },
      })
    )
  )

export const updateIssueThumbnail = async (
  client: ApiClient,
  input: { id: string; organizationId: string; fileId: string | null }
) =>
  parseIssueThumbnail(
    unwrap(
      await client.issues({ id: input.id }).thumbnail.put({
        organizationId: input.organizationId,
        fileId: input.fileId,
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
