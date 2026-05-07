import type { Db } from "@enterprise-agentic-saas/db"

import { publicErrors } from "../../errors/app-error"
import {
  deleteTodoById,
  findMembershipRole,
  insertTodo,
  listTodosByOrganization,
  updateTodoById,
} from "./repository"

const assertMembership = async (
  db: Db,
  input: { userId: string; organizationId: string }
) => {
  const role = await findMembershipRole(db, input)
  if (!role) {
    throw publicErrors.forbidden(
      "You do not have access to this organization",
      {
        organizationId: input.organizationId,
      }
    )
  }
}

const normalizeTitle = (title: string) => {
  const normalized = title.trim()
  if (!normalized) {
    throw publicErrors.validation("Todo title is required", {
      field: "title",
    })
  }
  return normalized
}

export const listTodos = async (
  db: Db,
  input: { userId: string; organizationId: string }
) => {
  await assertMembership(db, input)
  return listTodosByOrganization(db, input.organizationId)
}

export const createTodo = async (
  db: Db,
  input: { userId: string; organizationId: string; title: string }
) => {
  await assertMembership(db, input)
  return insertTodo(db, {
    organizationId: input.organizationId,
    title: normalizeTitle(input.title),
  })
}

export const updateTodo = async (
  db: Db,
  input: {
    userId: string
    id: string
    organizationId: string
    title?: string
    completed?: boolean
  }
) => {
  await assertMembership(db, input)

  if (input.title === undefined && input.completed === undefined) {
    throw publicErrors.validation("No todo changes provided")
  }

  const todo = await updateTodoById(db, {
    id: input.id,
    organizationId: input.organizationId,
    title: input.title === undefined ? undefined : normalizeTitle(input.title),
    completed: input.completed,
  })

  if (!todo) {
    throw publicErrors.notFound("Todo not found", { todoId: input.id })
  }

  return todo
}

export const deleteTodo = async (
  db: Db,
  input: { userId: string; id: string; organizationId: string }
) => {
  await assertMembership(db, input)

  const todo = await deleteTodoById(db, {
    id: input.id,
    organizationId: input.organizationId,
  })

  if (!todo) {
    throw publicErrors.notFound("Todo not found", { todoId: input.id })
  }

  return todo
}
