import type { ApiClient } from "@enterprise-agentic-saas/api/client"
import { queryOptions, type QueryFunctionContext } from "@tanstack/react-query"

import {
  getIssueThumbnail,
  listIssueComments,
  listIssues,
} from "@/features/issues/api"
import {
  issueListQueryKeyState,
  toIssueListRequest,
  type IssueSearchState,
} from "@/features/issues/search-params.shared"

export const issueKeys = {
  all: ["issues"] as const,
  lists: (organizationId: string) =>
    [...issueKeys.all, "list", organizationId] as const,
  list: (organizationId: string, state?: IssueSearchState) =>
    state
      ? ([
          ...issueKeys.lists(organizationId),
          issueListQueryKeyState(state),
        ] as const)
      : issueKeys.lists(organizationId),
  detail: (organizationId: string, issueId: string) =>
    [...issueKeys.all, "detail", organizationId, issueId] as const,
  timeline: (organizationId: string, issueId: string) =>
    [...issueKeys.all, "timeline", organizationId, issueId] as const,
  comments: (organizationId: string, issueId: string) =>
    [...issueKeys.all, "comments", organizationId, issueId] as const,
  thumbnail: (organizationId: string, issueId: string) =>
    [...issueKeys.all, "thumbnail", organizationId, issueId] as const,
}

const createIssuesQueryFn =
  (client: ApiClient, organizationId: string, state: IssueSearchState) =>
  ({ signal }: QueryFunctionContext) =>
    listIssues(client, toIssueListRequest(organizationId, state), signal)

const createIssueCommentsQueryFn =
  (client: ApiClient, organizationId: string, issueId: string) =>
  ({ signal }: QueryFunctionContext) =>
    listIssueComments(client, { id: issueId, organizationId }, signal)

const createIssueThumbnailQueryFn =
  (client: ApiClient, organizationId: string, issueId: string) =>
  ({ signal }: QueryFunctionContext) =>
    getIssueThumbnail(client, { id: issueId, organizationId }, signal)

export const issuesQueryOptions = (
  client: ApiClient,
  organizationId: string,
  state: IssueSearchState
) =>
  queryOptions({
    queryKey: issueKeys.list(organizationId, state),
    queryFn: createIssuesQueryFn(client, organizationId, state),
    enabled: organizationId.length > 0,
  })

export const issueCommentsQueryOptions = (
  client: ApiClient,
  organizationId: string,
  issueId: string
) =>
  queryOptions({
    queryKey: issueKeys.comments(organizationId, issueId),
    queryFn: createIssueCommentsQueryFn(client, organizationId, issueId),
    enabled: organizationId.length > 0 && issueId.length > 0,
  })

export const issueThumbnailQueryOptions = (
  client: ApiClient,
  organizationId: string,
  issueId: string
) =>
  queryOptions({
    queryKey: issueKeys.thumbnail(organizationId, issueId),
    queryFn: createIssueThumbnailQueryFn(client, organizationId, issueId),
    enabled: organizationId.length > 0 && issueId.length > 0,
  })
