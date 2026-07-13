import type { ApiClient } from "@enterprise-agentic-saas/api/client"

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  role: string
}

export type TodoStatus = "open" | "in_progress" | "closed"
export type TodoPriority = "no_priority" | "low" | "medium" | "high" | "urgent"

export type Todo = {
  id: string
  organizationId: string
  number: number
  title: string
  description: string
  status: TodoStatus
  priority: TodoPriority
  assigneeId: string | null
  creatorId: string
  labels: string[]
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

export type TodoComment = {
  id: string
  organizationId: string
  todoId: string
  authorId: string
  author: {
    id: string
    name: string
    image: string | null
  }
  body: string
  createdAt: string
  updatedAt: string
}

export const todoQueryKeys = {
  organizations: ["organizations"] as const,
  todos: (organizationId: string) => ["todos", organizationId] as const,
  comments: (organizationId: string, todoId: string) =>
    ["todos", organizationId, todoId, "comments"] as const,
}

type EdenResult<T> = {
  data: T | null
  error: unknown
}

const unwrap = <T>(result: EdenResult<T>): T => {
  if (result.error) {
    throw result.error
  }

  if (result.data === null) {
    throw new Error("API response did not include data")
  }

  return result.data
}

export const listOrganizations = async (client: ApiClient) =>
  unwrap<OrganizationSummary[]>(await client.organizations.get())

export const listTodos = async (client: ApiClient, organizationId: string) =>
  unwrap<Todo[]>(
    await client.todos.get({
      query: { organizationId },
    })
  )

export const createTodo = async (
  client: ApiClient,
  input: {
    organizationId: string
    title: string
    description?: string
    status?: TodoStatus
    priority?: TodoPriority
    assigneeId?: string | null
    labels?: string[]
    dueDate?: string | null
  }
) => unwrap<Todo>(await client.todos.post(input))

export const updateTodo = async (
  client: ApiClient,
  input: {
    id: string
    organizationId: string
    title?: string
    description?: string
    status?: TodoStatus
    priority?: TodoPriority
    assigneeId?: string | null
    labels?: string[]
    dueDate?: string | null
  }
) =>
  unwrap<Todo>(
    await client.todos({ id: input.id }).patch({
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

export const deleteTodo = async (
  client: ApiClient,
  input: { id: string; organizationId: string }
) =>
  unwrap<Todo>(
    await client.todos({ id: input.id }).delete({
      organizationId: input.organizationId,
    })
  )

export const listTodoComments = async (
  client: ApiClient,
  input: { id: string; organizationId: string }
) =>
  unwrap<TodoComment[]>(
    await client.todos({ id: input.id }).comments.get({
      query: { organizationId: input.organizationId },
    })
  )

export const createTodoComment = async (
  client: ApiClient,
  input: { id: string; organizationId: string; body: string }
) =>
  unwrap<TodoComment>(
    await client.todos({ id: input.id }).comments.post({
      organizationId: input.organizationId,
      body: input.body,
    })
  )

export const updateTodoComment = async (
  client: ApiClient,
  input: {
    id: string
    commentId: string
    organizationId: string
    body: string
  }
) =>
  unwrap<TodoComment>(
    await client
      .todos({ id: input.id })
      .comments({ commentId: input.commentId })
      .patch({
        organizationId: input.organizationId,
        body: input.body,
      })
  )

export const deleteTodoComment = async (
  client: ApiClient,
  input: { id: string; commentId: string; organizationId: string }
) =>
  unwrap<TodoComment>(
    await client
      .todos({ id: input.id })
      .comments({ commentId: input.commentId })
      .delete({ organizationId: input.organizationId })
  )
