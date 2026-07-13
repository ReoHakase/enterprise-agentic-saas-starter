import type { Db } from "@enterprise-agentic-saas/db"
import type {
  TodoPriority,
  TodoStatus,
} from "@enterprise-agentic-saas/db/schema"

import { publicErrors } from "../../errors/app-error"
import { getMembership, requireMembership } from "../authorization/roles"
import {
  deleteTodoById,
  deleteTodoCommentById,
  findTodoById,
  findTodoCommentById,
  insertTodo,
  insertTodoComment,
  listTodoComments,
  listTodosByOrganization,
  updateTodoById,
  updateTodoCommentById,
  type ListTodosInput,
} from "./repository"

const normalizeRequired = (value: string, field: string) => {
  const normalized = value.trim()
  if (!normalized) {
    throw publicErrors.validation(`${field} is required`, { field })
  }
  return normalized
}

const normalizeLabels = (labels: string[]) => {
  const normalized = labels.map((label) => label.trim()).filter(Boolean)
  return [...new Set(normalized)]
}

const parseDueDate = (value: string | null | undefined) => {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw publicErrors.validation("Invalid due date", { field: "dueDate" })
  }
  return date
}

const assertAssigneeMembership = async (
  db: Db,
  input: { assigneeId?: string | null; organizationId: string }
) => {
  if (!input.assigneeId) {
    return
  }
  const membership = await getMembership(db, {
    userId: input.assigneeId,
    organizationId: input.organizationId,
  })
  if (!membership) {
    throw publicErrors.validation(
      "Assignee must be a member of the organization",
      { field: "assigneeId", reason: "not_a_member" }
    )
  }
}

export const listTodos = async (
  db: Db,
  input: ListTodosInput & { userId: string }
) => {
  await requireMembership(db, input)
  return listTodosByOrganization(db, input)
}

export const getTodo = async (
  db: Db,
  input: { userId: string; id: string; organizationId: string }
) => {
  await requireMembership(db, input)
  const todo = await findTodoById(db, input)
  if (!todo) {
    throw publicErrors.notFound("Todo not found", { resource: "todo" })
  }
  return todo
}

export const createTodo = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    title: string
    description?: string
    status?: TodoStatus
    priority?: TodoPriority
    assigneeId?: string | null
    labels?: string[]
    dueDate?: string | null
  }
) => {
  await requireMembership(db, input)
  await assertAssigneeMembership(db, input)

  const todo = await insertTodo(db, {
    organizationId: input.organizationId,
    creatorId: input.userId,
    title: normalizeRequired(input.title, "title"),
    description: input.description?.trim() ?? "",
    status: input.status ?? "open",
    priority: input.priority ?? "no_priority",
    assigneeId: input.assigneeId ?? null,
    labels: normalizeLabels(input.labels ?? []),
    dueDate: parseDueDate(input.dueDate) ?? null,
  })

  return todo
}

export const updateTodo = async (
  db: Db,
  input: {
    userId: string
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
) => {
  await requireMembership(db, input)
  await assertAssigneeMembership(db, input)

  const changes = [
    input.title,
    input.description,
    input.status,
    input.priority,
    input.assigneeId,
    input.labels,
    input.dueDate,
  ]
  if (changes.every((value) => value === undefined)) {
    throw publicErrors.validation("No todo changes provided")
  }

  const todo = await updateTodoById(db, {
    id: input.id,
    actorUserId: input.userId,
    organizationId: input.organizationId,
    title:
      input.title === undefined
        ? undefined
        : normalizeRequired(input.title, "title"),
    description: input.description?.trim(),
    status: input.status,
    priority: input.priority,
    assigneeId: input.assigneeId,
    labels:
      input.labels === undefined ? undefined : normalizeLabels(input.labels),
    dueDate: parseDueDate(input.dueDate),
  })

  if (!todo) {
    throw publicErrors.notFound("Todo not found", { resource: "todo" })
  }

  return todo
}

export const deleteTodo = async (
  db: Db,
  input: { userId: string; id: string; organizationId: string }
) => {
  const membership = await requireMembership(db, input)
  const current = await findTodoById(db, input)
  if (!current) {
    throw publicErrors.notFound("Todo not found", { resource: "todo" })
  }
  if (membership.role === "member" && current.creatorId !== input.userId) {
    throw publicErrors.forbidden("Only the creator or an admin can delete")
  }

  const todo = await deleteTodoById(db, {
    ...input,
    actorUserId: input.userId,
  })
  if (!todo) {
    throw publicErrors.notFound("Todo not found", { resource: "todo" })
  }
  return todo
}

export const getTodoComments = async (
  db: Db,
  input: { userId: string; organizationId: string; todoId: string }
) => {
  await getTodo(db, {
    userId: input.userId,
    id: input.todoId,
    organizationId: input.organizationId,
  })
  return listTodoComments(db, input)
}

export const createTodoComment = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    todoId: string
    body: string
  }
) => {
  await getTodo(db, {
    userId: input.userId,
    id: input.todoId,
    organizationId: input.organizationId,
  })
  const comment = await insertTodoComment(db, {
    organizationId: input.organizationId,
    todoId: input.todoId,
    authorId: input.userId,
    body: normalizeRequired(input.body, "body"),
  })
  return comment
}

export const updateTodoComment = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    todoId: string
    commentId: string
    body: string
  }
) => {
  const membership = await requireMembership(db, input)
  const current = await findTodoCommentById(db, input)
  if (!current) {
    throw publicErrors.notFound("Comment not found", {
      resource: "todo_comment",
    })
  }
  if (membership.role === "member" && current.authorId !== input.userId) {
    throw publicErrors.forbidden("Only the author or an admin can edit")
  }

  const comment = await updateTodoCommentById(db, {
    ...input,
    actorUserId: input.userId,
    body: normalizeRequired(input.body, "body"),
  })
  if (!comment) {
    throw publicErrors.notFound("Comment not found", {
      resource: "todo_comment",
    })
  }
  return comment
}

export const deleteTodoComment = async (
  db: Db,
  input: {
    userId: string
    organizationId: string
    todoId: string
    commentId: string
  }
) => {
  const membership = await requireMembership(db, input)
  const current = await findTodoCommentById(db, input)
  if (!current) {
    throw publicErrors.notFound("Comment not found", {
      resource: "todo_comment",
    })
  }
  if (membership.role === "member" && current.authorId !== input.userId) {
    throw publicErrors.forbidden("Only the author or an admin can delete")
  }

  const comment = await deleteTodoCommentById(db, {
    ...input,
    actorUserId: input.userId,
  })
  if (!comment) {
    throw publicErrors.notFound("Comment not found", {
      resource: "todo_comment",
    })
  }
  return comment
}
