"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  TodoWorkspace,
  type TodoUiItem,
  type TodoUiOrganization,
} from "@enterprise-agentic-saas/ui/components/todos"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { apiClient } from "@/lib/api-client"
import {
  createTodo,
  deleteTodo,
  listOrganizations,
  listTodos,
  todoQueryKeys,
  updateTodo,
  type OrganizationSummary,
  type Todo,
} from "@/lib/todos"

type TodosDashboardProps = {
  initialOrganizationId?: string
  userLabel: string
}

const EMPTY_ORGANIZATIONS: OrganizationSummary[] = []

export const TodosDashboard = ({
  initialOrganizationId,
  userLabel,
}: TodosDashboardProps) => {
  const queryClient = useQueryClient()
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    initialOrganizationId ?? ""
  )
  const [title, setTitle] = useState("")
  const [busyTodoId, setBusyTodoId] = useState<string>()

  const organizationsQuery = useQuery({
    queryKey: todoQueryKeys.organizations,
    queryFn: () => listOrganizations(apiClient),
  })

  const organizations = organizationsQuery.data ?? EMPTY_ORGANIZATIONS

  useEffect(() => {
    if (!selectedOrganizationId && organizations[0]) {
      setSelectedOrganizationId(organizations[0].id)
    }
  }, [organizations, selectedOrganizationId])

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

  const uiOrganizations = useMemo(
    () => organizations.map(toUiOrganization),
    [organizations]
  )
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
      organizations={uiOrganizations}
      selectedOrganizationId={selectedOrganizationId}
      todos={uiTodos}
      pending={createMutation.isPending}
      busyTodoId={busyTodoId}
      title={title}
      userLabel={userLabel}
      onOrganizationChange={setSelectedOrganizationId}
      onTitleChange={setTitle}
      onCreate={handleCreate}
      onToggle={handleToggle}
      onDelete={handleDelete}
    >
      <Button
        variant="outline"
        nativeButton={false}
        render={<Link href="/auth/sign-out">Sign out</Link>}
      />
    </TodoWorkspace>
  )
}

const toUiOrganization = (
  organization: OrganizationSummary
): TodoUiOrganization => ({
  id: organization.id,
  name: organization.name,
  role: organization.role,
})

const toUiTodo = (todo: Todo): TodoUiItem => ({
  id: todo.id,
  title: todo.title,
  completed: todo.completed,
})
