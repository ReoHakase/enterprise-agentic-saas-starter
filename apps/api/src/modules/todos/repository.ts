import type { Db } from "@enterprise-agentic-saas/db"
import { member, todos } from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"

export type TodoDto = {
  id: string
  organizationId: string
  title: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

type TodoRow = typeof todos.$inferSelect

const toTodoDto = (todo: TodoRow): TodoDto => ({
  id: todo.id,
  organizationId: todo.organizationId,
  title: todo.title,
  completed: todo.completed,
  createdAt: todo.createdAt.toISOString(),
  updatedAt: todo.updatedAt.toISOString(),
})

export const findMembershipRole = async (
  db: Db,
  input: { userId: string; organizationId: string }
) => {
  try {
    const rows = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, input.userId),
          eq(member.organizationId, input.organizationId)
        )
      )
      .limit(1)

    return rows[0]?.role ?? null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "findMembershipRole",
    })
  }
}

export const listTodosByOrganization = async (
  db: Db,
  organizationId: string
): Promise<TodoDto[]> => {
  try {
    const rows = await db
      .select()
      .from(todos)
      .where(eq(todos.organizationId, organizationId))
      .orderBy(desc(todos.createdAt))

    return rows.map(toTodoDto)
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "listTodosByOrganization",
    })
  }
}

export const insertTodo = async (
  db: Db,
  input: { organizationId: string; title: string }
): Promise<TodoDto> => {
  try {
    const rows = await db
      .insert(todos)
      .values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        title: input.title,
      })
      .returning()

    const todo = rows[0]
    if (!todo) {
      throw new Error("insert returned no rows")
    }

    return toTodoDto(todo)
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "insertTodo",
    })
  }
}

export const updateTodoById = async (
  db: Db,
  input: {
    id: string
    organizationId: string
    title?: string
    completed?: boolean
  }
): Promise<TodoDto | null> => {
  try {
    const rows = await db
      .update(todos)
      .set({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.completed === undefined
          ? {}
          : { completed: input.completed }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(todos.id, input.id),
          eq(todos.organizationId, input.organizationId)
        )
      )
      .returning()

    const todo = rows[0]
    return todo ? toTodoDto(todo) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "updateTodoById",
    })
  }
}

export const deleteTodoById = async (
  db: Db,
  input: { id: string; organizationId: string }
): Promise<TodoDto | null> => {
  try {
    const rows = await db
      .delete(todos)
      .where(
        and(
          eq(todos.id, input.id),
          eq(todos.organizationId, input.organizationId)
        )
      )
      .returning()

    const todo = rows[0]
    return todo ? toTodoDto(todo) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "deleteTodoById",
    })
  }
}
