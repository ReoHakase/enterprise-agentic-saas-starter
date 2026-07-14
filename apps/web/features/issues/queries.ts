import type { ApiClient } from "@enterprise-agentic-saas/api/client"
import { queryOptions } from "@tanstack/react-query"

import { listIssueComments, listIssues } from "@/features/issues/api"

export const issueKeys = {
  all: ["issues"] as const,
  list: (organizationId: string) =>
    [...issueKeys.all, "list", organizationId] as const,
  comments: (organizationId: string, issueId: string) =>
    [...issueKeys.all, "comments", organizationId, issueId] as const,
}

const createIssuesQueryFn = (client: ApiClient, organizationId: string) => () =>
  listIssues(client, organizationId)

const createIssueCommentsQueryFn =
  (client: ApiClient, organizationId: string, issueId: string) => () =>
    listIssueComments(client, { id: issueId, organizationId })

export const issuesQueryOptions = (client: ApiClient, organizationId: string) =>
  queryOptions({
    queryKey: issueKeys.list(organizationId),
    queryFn: createIssuesQueryFn(client, organizationId),
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
