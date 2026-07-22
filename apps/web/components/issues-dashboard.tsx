"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { getConsoleApiErrorText } from "@/features/console/error"
import { showConsoleApiErrorToast } from "@/features/console/error-toast"
import { membersQueryOptions } from "@/features/console/queries"
import { createIssue, deleteIssue, updateIssue } from "@/features/issues/api"
import { IssuesWorkspace } from "@/features/issues/components/issues-workspace"
import type {
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "@/features/issues/components/types"
import { issueKeys, issuesQueryOptions } from "@/features/issues/queries"
import type { Issue } from "@/features/issues/schema"
import {
  useIssueSearchState,
  withAgentThreadHref,
} from "@/features/issues/search-params"
import { apiClient } from "@/lib/api-client"

type IssuesDashboardProps = {
  organizationId: string
  organizationSlug: string
}

export const IssuesDashboard = ({
  organizationId,
  organizationSlug,
}: IssuesDashboardProps) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { state: searchState, setSearch, setDiscrete } = useIssueSearchState()
  const [busyIssueId, setBusyIssueId] = useState<string>()
  const issuesQuery = useQuery(
    issuesQueryOptions(apiClient, organizationId, searchState)
  )
  const membersQuery = useQuery(membersQueryOptions(organizationId))

  const invalidateIssues = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: issueKeys.lists(organizationId),
      }),
    [organizationId, queryClient]
  )

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      createIssue(apiClient, { organizationId, title }),
    onSuccess: async () => {
      await invalidateIssues()
      toast.success("Issue created")
    },
    onError: (error) => {
      showConsoleApiErrorToast(error, "Issue creation failed")
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({
      issue,
      update,
    }: {
      issue: IssueUiItem
      update: IssueUpdate
    }) => updateIssue(apiClient, { id: issue.id, organizationId, ...update }),
    onMutate: ({ issue }) => setBusyIssueId(issue.id),
    onSuccess: async () => {
      await invalidateIssues()
      toast.success("Issue updated")
    },
    onSettled: () => setBusyIssueId(undefined),
    onError: (error) => {
      showConsoleApiErrorToast(error, "Issue update failed")
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (issue: IssueUiItem) =>
      deleteIssue(apiClient, { id: issue.id, organizationId }),
    onMutate: (issue) => setBusyIssueId(issue.id),
    onSuccess: async () => {
      await invalidateIssues()
      toast.success("Issue deleted")
    },
    onSettled: () => setBusyIssueId(undefined),
    onError: (error) => {
      showConsoleApiErrorToast(error, "Issue deletion failed")
    },
  })
  const { mutateAsync: createIssueAsync, isPending: createPending } =
    createMutation
  const { mutateAsync: updateIssueAsync, isPending: updatePending } =
    updateMutation
  const { mutateAsync: deleteIssueAsync } = deleteMutation
  const { refetch: refetchIssues } = issuesQuery

  const issues = useMemo(
    () => (issuesQuery.data?.items ?? []).map(toIssueViewModel),
    [issuesQuery.data]
  )
  const assignees = useMemo<IssueAssigneeOption[]>(
    () =>
      (membersQuery.data ?? []).map((member) => ({
        id: member.userId,
        name: member.name,
        email: member.email,
        profileImage: member.profileImage,
      })),
    [membersQuery.data]
  )
  const handleCreate = useCallback(
    async (title: string) => {
      await createIssueAsync(title.trim())
    },
    [createIssueAsync]
  )
  const handleToggle = useCallback(
    async (issue: IssueUiItem) => {
      await updateIssueAsync({
        issue,
        update: { status: issue.status === "closed" ? "open" : "closed" },
      })
    },
    [updateIssueAsync]
  )
  const handleUpdate = useCallback(
    async (issue: IssueUiItem, update: IssueUpdate) => {
      await updateIssueAsync({ issue, update })
    },
    [updateIssueAsync]
  )
  const handleDelete = useCallback(
    async (issue: IssueUiItem) => {
      await deleteIssueAsync(issue)
    },
    [deleteIssueAsync]
  )
  const handleSelect = useCallback(
    (issue: IssueUiItem) => {
      router.push(
        withAgentThreadHref(
          `/organization/${organizationSlug}/issues/${issue.number.toString()}`,
          searchState.agentThread
        )
      )
    },
    [organizationSlug, router, searchState.agentThread]
  )
  const getIssueHref = useCallback(
    (issue: IssueUiItem) =>
      withAgentThreadHref(
        `/organization/${organizationSlug}/issues/${issue.number.toString()}`,
        searchState.agentThread
      ),
    [organizationSlug, searchState.agentThread]
  )
  const handleRetry = useCallback(() => {
    void refetchIssues()
  }, [refetchIssues])
  const handleSearchChange = useCallback(
    (q: string) => {
      void setSearch({ q, page: 1 })
    },
    [setSearch]
  )

  const errorMessage = issuesQuery.error
    ? getConsoleApiErrorText(
        issuesQuery.error,
        "The issue list request failed."
      )
    : undefined

  return (
    <IssuesWorkspace
      issues={issues}
      organizationId={organizationId}
      searchState={searchState}
      total={issuesQuery.data?.total ?? 0}
      pageSize={issuesQuery.data?.pageSize ?? 10}
      pending={createPending || updatePending}
      busyIssueId={busyIssueId}
      error={errorMessage}
      onCreate={handleCreate}
      onToggle={handleToggle}
      onUpdate={handleUpdate}
      assignees={assignees}
      getIssueHref={getIssueHref}
      onDelete={handleDelete}
      onSelectIssue={handleSelect}
      onRetry={handleRetry}
      onSearchChange={handleSearchChange}
      onViewChange={setDiscrete}
    />
  )
}

const toIssueViewModel = (issue: Issue): IssueUiItem => ({
  id: issue.id,
  number: issue.number,
  title: issue.title,
  description: issue.description,
  status: issue.status,
  priority: issue.priority,
  assigneeId: issue.assigneeId,
  creatorId: issue.creatorId,
  labels: issue.labels,
  dueDate: issue.dueDate,
  revision: issue.revision,
  createdAt: issue.createdAt,
  updatedAt: issue.updatedAt,
})
