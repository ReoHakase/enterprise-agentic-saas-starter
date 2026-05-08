"use client"

import {
  TodoWorkspace,
  type TodoUiItem,
} from "@enterprise-agentic-saas/ui/components/todos"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"

import { apiClient } from "@/lib/api-client"
import {
  createTodo,
  deleteTodo,
  listTodos,
  todoQueryKeys,
  type Todo,
  updateTodo,
} from "@/lib/todos"

type TodosDashboardProps = {
  organizationId: string
}

export const TodosDashboard = ({ organizationId }: TodosDashboardProps) => {
  const queryClient = useQueryClient()
  const [selectedOrganizationId, setSelectedOrganizationId] =
    useState(organizationId)
  const [title, setTitle] = useState("")
  const [busyTodoId, setBusyTodoId] = useState<string>()

  useEffect(() => {
    setSelectedOrganizationId(organizationId)
  }, [organizationId])

  const todosQuery = useQuery({
    queryKey: todoQueryKeys.todos(selectedOrganizationId),
    queryFn: () => listTodos(apiClient, selectedOrganizationId),
    enabled: selectedOrganizationId.length > 0,
  })

  const invalidateTodos = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: todoQueryKeys.todos(selectedOrganizationId),
    })
  }, [queryClient, selectedOrganizationId])

  const createMutation = useMutation({
    mutationFn: () =>
      createTodo(apiClient, {
        organizationId: selectedOrganizationId,
        title: title.trim(),
      }),
    onSuccess: async () => {
      setTitle("")
      await invalidateTodos()
    },
  })

  const updateMutation = useMutation({
    mutationFn: (todo: TodoUiItem) =>
      updateTodo(apiClient, {
        id: todo.id,
        organizationId: selectedOrganizationId,
        completed: !todo.completed,
      }),
    onMutate: (todo) => setBusyTodoId(todo.id),
    onSettled: async () => {
      setBusyTodoId(undefined)
      await invalidateTodos()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (todo: TodoUiItem) =>
      deleteTodo(apiClient, {
        id: todo.id,
        organizationId: selectedOrganizationId,
      }),
    onMutate: (todo) => setBusyTodoId(todo.id),
    onSettled: async () => {
      setBusyTodoId(undefined)
      await invalidateTodos()
    },
  })

  const uiTodos = useMemo(
    () => (todosQuery.data ?? []).map(toUiTodo),
    [todosQuery.data]
  )
  const handleCreate = useCallback(() => {
    if (selectedOrganizationId && title.trim()) {
      createMutation.mutate()
    }
  }, [createMutation, selectedOrganizationId, title])
  const handleToggle = useCallback(
    (todo: TodoUiItem) => {
      updateMutation.mutate(todo)
    },
    [updateMutation]
  )
  const handleDelete = useCallback(
    (todo: TodoUiItem) => {
      deleteMutation.mutate(todo)
    },
    [deleteMutation]
  )

  return (
    <TodoWorkspace
      todos={uiTodos}
      pending={createMutation.isPending}
      busyTodoId={busyTodoId}
      title={title}
      onTitleChange={setTitle}
      onCreate={handleCreate}
      onToggle={handleToggle}
      onDelete={handleDelete}
    />
  )
}

const toUiTodo = (todo: Todo): TodoUiItem => ({
  id: todo.id,
  title: todo.title,
  completed: todo.completed,
})
