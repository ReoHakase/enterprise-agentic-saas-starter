import type { ApiClient } from "@enterprise-agentic-saas/api/client"

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  role: string
}

export type Todo = {
  id: string
  organizationId: string
  title: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

export const todoQueryKeys = {
  organizations: ["organizations"] as const,
  todos: (organizationId: string) => ["todos", organizationId] as const,
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
  input: { organizationId: string; title: string }
) => unwrap<Todo>(await client.todos.post(input))

export const updateTodo = async (
  client: ApiClient,
  input: {
    id: string
    organizationId: string
    title?: string
    completed?: boolean
  }
) =>
  unwrap<Todo>(
    await client.todos({ id: input.id }).patch({
      organizationId: input.organizationId,
      title: input.title,
      completed: input.completed,
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
