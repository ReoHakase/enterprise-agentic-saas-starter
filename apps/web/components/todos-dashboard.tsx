"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  IssuesWorkspace,
  type IssueAssigneeOption,
  type IssueUiItem,
  type IssueUpdate,
} from "@/components/todos/issues-workspace"
import { apiClient } from "@/lib/api-client"
import { browserConsoleApi } from "@/lib/browser/console-api"
import {
  createTodo,
  createTodoComment,
  deleteTodoComment,
  deleteTodo,
  listTodoComments,
  listTodos,
  todoQueryKeys,
  type Todo,
  updateTodoComment,
  updateTodo,
} from "@/lib/todos"

type TodosDashboardProps = {
  organizationId: string
}

export const TodosDashboard = ({ organizationId }: TodosDashboardProps) => {
  const queryClient = useQueryClient()
  const [selectedOrganizationId, setSelectedOrganizationId] =
    useState(organizationId)
  const [busyTodoId, setBusyTodoId] = useState<string>()
  const [selectedTodoId, setSelectedTodoId] = useState<string>()

  useEffect(() => {
    setSelectedOrganizationId(organizationId)
  }, [organizationId])

  const todosQuery = useQuery({
    queryKey: todoQueryKeys.todos(selectedOrganizationId),
    queryFn: () => listTodos(apiClient, selectedOrganizationId),
    enabled: selectedOrganizationId.length > 0,
  })
  const membersQuery = useQuery({
    queryKey: ["organizations", selectedOrganizationId, "members"],
    queryFn: () => browserConsoleApi.listMembers(selectedOrganizationId),
    enabled: selectedOrganizationId.length > 0,
  })

  const invalidateTodos = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: todoQueryKeys.todos(selectedOrganizationId),
    })
  }, [queryClient, selectedOrganizationId])

  const commentsQuery = useQuery({
    queryKey: todoQueryKeys.comments(
      selectedOrganizationId,
      selectedTodoId ?? "none"
    ),
    queryFn: () =>
      listTodoComments(apiClient, {
        id: selectedTodoId ?? "",
        organizationId: selectedOrganizationId,
      }),
    enabled: Boolean(selectedOrganizationId && selectedTodoId),
  })

  const invalidateComments = useCallback(async () => {
    if (!selectedTodoId) {
      return
    }
    await queryClient.invalidateQueries({
      queryKey: todoQueryKeys.comments(selectedOrganizationId, selectedTodoId),
    })
  }, [queryClient, selectedOrganizationId, selectedTodoId])

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      createTodo(apiClient, {
        organizationId: selectedOrganizationId,
        title,
      }),
    onSuccess: async () => {
      toast.success("Issue created")
      await invalidateTodos()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Issue creation failed"
      )
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      todo,
      update,
    }: {
      todo: IssueUiItem
      update: IssueUpdate
    }) =>
      updateTodo(apiClient, {
        id: todo.id,
        organizationId: selectedOrganizationId,
        ...update,
      }),
    onMutate: ({ todo }) => setBusyTodoId(todo.id),
    onSettled: async () => {
      setBusyTodoId(undefined)
      await invalidateTodos()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Issue update failed"
      )
    },
  })

  const createCommentMutation = useMutation({
    mutationFn: ({ todo, body }: { todo: IssueUiItem; body: string }) =>
      createTodoComment(apiClient, {
        id: todo.id,
        organizationId: selectedOrganizationId,
        body,
      }),
    onSuccess: async () => {
      toast.success("Comment added")
      await invalidateComments()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Comment failed")
    },
  })

  const updateCommentMutation = useMutation({
    mutationFn: ({
      todo,
      commentId,
      body,
    }: {
      todo: IssueUiItem
      commentId: string
      body: string
    }) =>
      updateTodoComment(apiClient, {
        id: todo.id,
        commentId,
        organizationId: selectedOrganizationId,
        body,
      }),
    onSuccess: invalidateComments,
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Comment update failed"
      )
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: ({
      todo,
      commentId,
    }: {
      todo: IssueUiItem
      commentId: string
    }) =>
      deleteTodoComment(apiClient, {
        id: todo.id,
        commentId,
        organizationId: selectedOrganizationId,
      }),
    onSuccess: invalidateComments,
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Comment deletion failed"
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (todo: IssueUiItem) =>
      deleteTodo(apiClient, {
        id: todo.id,
        organizationId: selectedOrganizationId,
      }),
    onMutate: (todo) => setBusyTodoId(todo.id),
    onSettled: async () => {
      setBusyTodoId(undefined)
      await invalidateTodos()
    },
    onSuccess: () => {
      toast.success("Issue deleted")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Issue deletion failed"
      )
    },
  })

  const uiTodos = useMemo(
    () => (todosQuery.data ?? []).map(toUiTodo),
    [todosQuery.data]
  )
  const assignees = useMemo<IssueAssigneeOption[]>(
    () =>
      (membersQuery.data ?? []).map((member) => ({
        id: member.userId,
        name: member.name,
        email: member.email,
      })),
    [membersQuery.data]
  )
  const handleCreate = useCallback(
    (title: string) => {
      if (selectedOrganizationId && title.trim()) {
        createMutation.mutate(title.trim())
      }
    },
    [createMutation, selectedOrganizationId]
  )
  const handleToggle = useCallback(
    (todo: IssueUiItem) => {
      updateMutation.mutate({
        todo,
        update: { status: todo.status === "closed" ? "open" : "closed" },
      })
    },
    [updateMutation]
  )
  const handleUpdate = useCallback(
    (todo: IssueUiItem, update: IssueUpdate) => {
      updateMutation.mutate({ todo, update })
    },
    [updateMutation]
  )
  const handleDelete = useCallback(
    (todo: IssueUiItem) => {
      deleteMutation.mutate(todo)
    },
    [deleteMutation]
  )
  const handleRetry = useCallback(() => {
    void todosQuery.refetch()
  }, [todosQuery])

  const errorMessage = todosQuery.error
    ? todosQuery.error instanceof Error
      ? todosQuery.error.message
      : "The issue list request failed."
    : undefined

  return (
    <IssuesWorkspace
      issues={uiTodos}
      pending={createMutation.isPending}
      busyIssueId={busyTodoId}
      error={errorMessage}
      onCreate={handleCreate}
      onToggle={handleToggle}
      onUpdate={handleUpdate}
      assignees={assignees}
      onDelete={handleDelete}
      onSelectIssue={(todo) => setSelectedTodoId(todo?.id)}
      comments={commentsQuery.data}
      commentsPending={commentsQuery.isPending && Boolean(selectedTodoId)}
      commentsError={
        commentsQuery.error instanceof Error
          ? commentsQuery.error.message
          : commentsQuery.error
            ? "Comments could not be loaded."
            : undefined
      }
      onCreateComment={(todo, body) =>
        createCommentMutation.mutate({ todo, body })
      }
      onUpdateComment={(todo, commentId, body) =>
        updateCommentMutation.mutate({ todo, commentId, body })
      }
      onDeleteComment={(todo, commentId) =>
        deleteCommentMutation.mutate({ todo, commentId })
      }
      onRetry={handleRetry}
    />
  )
}

const toUiTodo = (todo: Todo): IssueUiItem => ({
  id: todo.id,
  number: todo.number,
  title: todo.title,
  description: todo.description,
  status: todo.status,
  priority: todo.priority,
  assigneeId: todo.assigneeId,
  creatorId: todo.creatorId,
  labels: todo.labels,
  dueDate: todo.dueDate,
  createdAt: todo.createdAt,
  updatedAt: todo.updatedAt,
})
