"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAtom } from "jotai"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  IssuesWorkspace,
  type IssueAssigneeOption,
  type IssueUiItem,
  type IssueUpdate,
} from "@/components/todos/issues-workspace"
import { membersQueryOptions } from "@/features/console/queries"
import {
  createIssue,
  createIssueComment,
  deleteIssue,
  deleteIssueComment,
  updateIssue,
  updateIssueComment,
} from "@/features/issues/api"
import {
  issueCommentsQueryOptions,
  issueKeys,
  issuesQueryOptions,
} from "@/features/issues/queries"
import type { Issue } from "@/features/issues/schema"
import { selectedIssueAtom } from "@/features/issues/state"
import { apiClient } from "@/lib/api-client"

type TodosDashboardProps = {
  organizationId: string
}

export const TodosDashboard = ({ organizationId }: TodosDashboardProps) => {
  const queryClient = useQueryClient()
  const [busyIssueId, setBusyIssueId] = useState<string>()
  const [selectedIssue, setSelectedIssue] = useAtom(selectedIssueAtom)
  const selectedIssueId =
    selectedIssue.organizationId === organizationId
      ? selectedIssue.issueId
      : undefined

  const issuesQuery = useQuery(issuesQueryOptions(apiClient, organizationId))
  const membersQuery = useQuery(membersQueryOptions(organizationId))
  const commentsQuery = useQuery(
    issueCommentsQueryOptions(apiClient, organizationId, selectedIssueId ?? "")
  )

  const invalidateIssues = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: issueKeys.list(organizationId),
      }),
    [organizationId, queryClient]
  )
  const invalidateComments = useCallback(() => {
    if (!selectedIssueId) {
      return Promise.resolve()
    }

    return queryClient.invalidateQueries({
      queryKey: issueKeys.comments(organizationId, selectedIssueId),
    })
  }, [organizationId, queryClient, selectedIssueId])

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      createIssue(apiClient, { organizationId, title }),
    onSuccess: async () => {
      await invalidateIssues()
      toast.success("Issue created")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Issue creation failed"
      )
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
      toast.error(
        error instanceof Error ? error.message : "Issue update failed"
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (issue: IssueUiItem) =>
      deleteIssue(apiClient, { id: issue.id, organizationId }),
    onMutate: (issue) => setBusyIssueId(issue.id),
    onSuccess: async (_, issue) => {
      if (selectedIssueId === issue.id) {
        setSelectedIssue({})
      }
      await invalidateIssues()
      toast.success("Issue deleted")
    },
    onSettled: () => setBusyIssueId(undefined),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Issue deletion failed"
      )
    },
  })

  const createCommentMutation = useMutation({
    mutationFn: ({ issue, body }: { issue: IssueUiItem; body: string }) =>
      createIssueComment(apiClient, {
        id: issue.id,
        organizationId,
        body,
      }),
    onSuccess: async () => {
      await invalidateComments()
      toast.success("Comment added")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Comment failed")
    },
  })

  const updateCommentMutation = useMutation({
    mutationFn: ({
      issue,
      commentId,
      body,
    }: {
      issue: IssueUiItem
      commentId: string
      body: string
    }) =>
      updateIssueComment(apiClient, {
        id: issue.id,
        commentId,
        organizationId,
        body,
      }),
    onSuccess: async () => {
      await invalidateComments()
      toast.success("Comment updated")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Comment update failed"
      )
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: ({
      issue,
      commentId,
    }: {
      issue: IssueUiItem
      commentId: string
    }) =>
      deleteIssueComment(apiClient, {
        id: issue.id,
        commentId,
        organizationId,
      }),
    onSuccess: async () => {
      await invalidateComments()
      toast.success("Comment deleted")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Comment deletion failed"
      )
    },
  })

  const { isPending: createPending, mutateAsync: createIssueAsync } =
    createMutation
  const { isPending: updatePending, mutateAsync: updateIssueAsync } =
    updateMutation
  const { mutateAsync: deleteIssueAsync } = deleteMutation
  const { isPending: createCommentPending, mutateAsync: createCommentAsync } =
    createCommentMutation
  const { isPending: updateCommentPending, mutateAsync: updateCommentAsync } =
    updateCommentMutation
  const { isPending: deleteCommentPending, mutateAsync: deleteCommentAsync } =
    deleteCommentMutation
  const { refetch: refetchIssues } = issuesQuery

  const issues = useMemo(
    () => (issuesQuery.data ?? []).map(toIssueViewModel),
    [issuesQuery.data]
  )
  const assignees = useMemo<IssueAssigneeOption[]>(
    () =>
      (membersQuery.data ?? []).map((member) => ({
        id: member.userId,
        name: member.name,
        email: member.email,
        image: member.image,
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
  const handleSelectIssue = useCallback(
    (issue?: IssueUiItem) =>
      setSelectedIssue(issue ? { organizationId, issueId: issue.id } : {}),
    [organizationId, setSelectedIssue]
  )
  const handleCreateComment = useCallback(
    async (issue: IssueUiItem, body: string) => {
      await createCommentAsync({ issue, body })
    },
    [createCommentAsync]
  )
  const handleUpdateComment = useCallback(
    async (issue: IssueUiItem, commentId: string, body: string) => {
      await updateCommentAsync({ issue, commentId, body })
    },
    [updateCommentAsync]
  )
  const handleDeleteComment = useCallback(
    async (issue: IssueUiItem, commentId: string) => {
      await deleteCommentAsync({ issue, commentId })
    },
    [deleteCommentAsync]
  )
  const handleRetry = useCallback(() => {
    void refetchIssues()
  }, [refetchIssues])

  const errorMessage = issuesQuery.error
    ? issuesQuery.error instanceof Error
      ? issuesQuery.error.message
      : "The issue list request failed."
    : undefined

  return (
    <IssuesWorkspace
      issues={issues}
      pending={
        createPending ||
        updatePending ||
        createCommentPending ||
        updateCommentPending ||
        deleteCommentPending
      }
      busyIssueId={busyIssueId}
      error={errorMessage}
      onCreate={handleCreate}
      onToggle={handleToggle}
      onUpdate={handleUpdate}
      assignees={assignees}
      onDelete={handleDelete}
      selectedIssueId={selectedIssueId ?? null}
      onSelectIssue={handleSelectIssue}
      comments={commentsQuery.data}
      commentsPending={commentsQuery.isPending && Boolean(selectedIssueId)}
      commentsError={
        commentsQuery.error instanceof Error
          ? commentsQuery.error.message
          : commentsQuery.error
            ? "Comments could not be loaded."
            : undefined
      }
      onCreateComment={handleCreateComment}
      onUpdateComment={handleUpdateComment}
      onDeleteComment={handleDeleteComment}
      onRetry={handleRetry}
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
  createdAt: issue.createdAt,
  updatedAt: issue.updatedAt,
})
