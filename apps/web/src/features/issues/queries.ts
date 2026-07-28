import type { ApiClient } from "@enterprise-agentic-saas/api/client"
import {
  keepPreviousData,
  queryOptions,
  type QueryFunctionContext,
} from "@tanstack/react-query"

import { getIssueThumbnail, listIssueLabels, listIssues } from "./api"
import {
  issueListQueryKeyState,
  toIssueListRequest,
  type IssueSearchState,
} from "./search-params.shared"

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
  labels: (organizationId: string, search: string) =>
    [...issueKeys.all, "labels", organizationId, search] as const,
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

const createIssueThumbnailQueryFn =
  (client: ApiClient, organizationId: string, issueId: string) =>
  ({ signal }: QueryFunctionContext) =>
    getIssueThumbnail(client, { id: issueId, organizationId }, signal)

const createIssueLabelQueryFn =
  (client: ApiClient, organizationId: string, search: string) =>
  ({ signal }: QueryFunctionContext) =>
    listIssueLabels(
      client,
      { organizationId, search: search || undefined },
      signal
    )

export const issuesQueryOptions = (
  client: ApiClient,
  organizationId: string,
  state: IssueSearchState,
  scope?: "agent-mention-candidates"
) =>
  queryOptions({
    queryKey: scope
      ? [...issueKeys.list(organizationId, state), scope]
      : issueKeys.list(organizationId, state),
    queryFn: createIssuesQueryFn(client, organizationId, state),
    enabled: organizationId.length > 0,
    placeholderData: keepPreviousData,
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

export const issueLabelQueryOptions = (
  client: ApiClient,
  organizationId: string,
  search: string
) =>
  queryOptions({
    queryKey: issueKeys.labels(organizationId, search),
    queryFn: createIssueLabelQueryFn(client, organizationId, search),
    enabled: organizationId.length > 0,
  })
