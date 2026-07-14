import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  member,
  todoComments,
  todos,
  type TodoPriority,
  type TodoStatus,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, asc, desc, eq, like, max, or, sql, type SQL } from "drizzle-orm"

import { publicErrors } from "../../errors/app-error"

export type TodoDto = {
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

export type TodoCommentDto = {
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

type TodoRow = typeof todos.$inferSelect
type TodoCommentRow = typeof todoComments.$inferSelect

type TodoCommentWithAuthorRow = TodoCommentRow & {
  authorUserId: string | null
  authorName: string | null
  authorImage: string | null
}

const toTodoDto = (todo: TodoRow): TodoDto => ({
  ...todo,
  dueDate: todo.dueDate?.toISOString().slice(0, 10) ?? null,
  createdAt: todo.createdAt.toISOString(),
  updatedAt: todo.updatedAt.toISOString(),
})

const toTodoCommentDto = (
  comment: TodoCommentWithAuthorRow
): TodoCommentDto => {
  const { authorImage, authorName, authorUserId, ...fields } = comment
  return {
    ...fields,
    author: {
      id: comment.authorId,
      name: authorUserId && authorName ? authorName : "Former member",
      image: authorUserId ? authorImage : null,
    },
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  }
}

const todoCommentSelection = {
  id: todoComments.id,
  organizationId: todoComments.organizationId,
  todoId: todoComments.todoId,
  authorId: todoComments.authorId,
  body: todoComments.body,
  createdAt: todoComments.createdAt,
  updatedAt: todoComments.updatedAt,
  authorUserId: user.id,
  authorName: user.name,
  authorImage: user.image,
}

const tenantSafeAuthorJoin = and(
  eq(user.id, todoComments.authorId),
  sql`exists (
    select 1
    from ${member}
    where ${member.userId} = ${todoComments.authorId}
      and ${member.organizationId} = ${todoComments.organizationId}
  )`
)

export type ListTodosInput = {
  organizationId: string
  search?: string
  status?: TodoStatus
  priority?: TodoPriority
  assigneeId?: string
  label?: string
  sortBy?:
    | "number"
    | "createdAt"
    | "updatedAt"
    | "dueDate"
    | "priority"
    | "status"
  sortDirection?: "asc" | "desc"
  limit?: number
}

export const listTodosByOrganization = async (
  db: Db,
  input: ListTodosInput
): Promise<TodoDto[]> => {
  try {
    const conditions: SQL[] = [eq(todos.organizationId, input.organizationId)]

    const search = input.search?.trim()
    if (search) {
      const searchCondition = or(
        like(todos.title, `%${search}%`),
        like(todos.description, `%${search}%`)
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }
    if (input.status) {
      conditions.push(eq(todos.status, input.status))
    }
    if (input.priority) {
      conditions.push(eq(todos.priority, input.priority))
    }
    if (input.assigneeId === "unassigned") {
      conditions.push(sql`${todos.assigneeId} is null`)
    } else if (input.assigneeId) {
      conditions.push(eq(todos.assigneeId, input.assigneeId))
    }
    if (input.label) {
      conditions.push(
        sql`exists (select 1 from json_each(${todos.labels}) where json_each.value = ${input.label})`
      )
    }

    const sortColumns = {
      number: todos.number,
      createdAt: todos.createdAt,
      updatedAt: todos.updatedAt,
      dueDate: todos.dueDate,
      priority: todos.priority,
      status: todos.status,
    }
    const sortColumn = sortColumns[input.sortBy ?? "updatedAt"]
    const order =
      input.sortDirection === "asc" ? asc(sortColumn) : desc(sortColumn)

    const rows = await db
      .select()
      .from(todos)
      .where(and(...conditions))
      .orderBy(order, desc(todos.number))
      .limit(input.limit ?? 50)

    return rows.map(toTodoDto)
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "listTodosByOrganization",
    })
  }
}

export const findTodoById = async (
  db: Db,
  input: { id: string; organizationId: string }
): Promise<TodoDto | null> => {
  try {
    const rows = await db
      .select()
      .from(todos)
      .where(
        and(
          eq(todos.id, input.id),
          eq(todos.organizationId, input.organizationId)
        )
      )
      .limit(1)

    return rows[0] ? toTodoDto(rows[0]) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "findTodoById",
    })
  }
}

const todoNumberQueues = new Map<string, Promise<void>>()
const noop = () => {}

const withTodoNumberLock = async <T>(
  organizationId: string,
  operation: () => Promise<T>
) => {
  const previous = todoNumberQueues.get(organizationId) ?? Promise.resolve()
  let release = noop
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  todoNumberQueues.set(organizationId, queued)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (todoNumberQueues.get(organizationId) === queued) {
      todoNumberQueues.delete(organizationId)
    }
  }
}

export const insertTodo = async (
  db: Db,
  input: {
    organizationId: string
    creatorId: string
    title: string
    description: string
    status: TodoStatus
    priority: TodoPriority
    assigneeId: string | null
    labels: string[]
    dueDate: Date | null
  }
): Promise<TodoDto> => {
  try {
    return await withTodoNumberLock(input.organizationId, async () => {
      const createWithRetry = async (attempt: number): Promise<TodoDto> => {
        try {
          const todo = await db.transaction(async (tx) => {
            const numberRows = await tx
              .select({ value: max(todos.number) })
              .from(todos)
              .where(eq(todos.organizationId, input.organizationId))
            const number = (numberRows[0]?.value ?? 0) + 1

            const rows = await tx
              .insert(todos)
              .values({
                id: crypto.randomUUID(),
                ...input,
                number,
              })
              .returning()

            const created = rows[0]
            if (!created) {
              throw new Error("insert returned no rows")
            }
            await tx.insert(auditLogs).values({
              id: crypto.randomUUID(),
              organizationId: input.organizationId,
              actorUserId: input.creatorId,
              action: "todo.created",
              targetType: "todo",
              targetId: created.id,
              metadata: { number: created.number },
            })
            return created
          })

          return toTodoDto(todo)
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : ""
          const numberConflict =
            message.includes("todos_organization_number_uidx") ||
            message.includes("todos.organization_id, todos.number")
          if (!numberConflict || attempt >= 3) {
            throw cause
          }
          return createWithRetry(attempt + 1)
        }
      }

      return createWithRetry(1)
    })
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
    actorUserId: string
    organizationId: string
    title?: string
    description?: string
    status?: TodoStatus
    priority?: TodoPriority
    assigneeId?: string | null
    labels?: string[]
    dueDate?: Date | null
  }
): Promise<TodoDto | null> => {
  try {
    const rows = await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(todos)
        .set({
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.assigneeId === undefined
            ? {}
            : { assigneeId: input.assigneeId }),
          ...(input.labels === undefined ? {} : { labels: input.labels }),
          ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(todos.id, input.id),
            eq(todos.organizationId, input.organizationId)
          )
        )
        .returning()
      if (updatedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "todo.updated",
          targetType: "todo",
          targetId: input.id,
          metadata: { number: updatedRows[0].number },
        })
      }
      return updatedRows
    })

    return rows[0] ? toTodoDto(rows[0]) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "updateTodoById",
    })
  }
}

export const deleteTodoById = async (
  db: Db,
  input: { actorUserId: string; id: string; organizationId: string }
): Promise<TodoDto | null> => {
  try {
    const rows = await db.transaction(async (tx) => {
      const deletedRows = await tx
        .delete(todos)
        .where(
          and(
            eq(todos.id, input.id),
            eq(todos.organizationId, input.organizationId)
          )
        )
        .returning()
      if (deletedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "todo.deleted",
          targetType: "todo",
          targetId: input.id,
          metadata: { number: deletedRows[0].number },
        })
      }
      return deletedRows
    })

    return rows[0] ? toTodoDto(rows[0]) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "deleteTodoById",
    })
  }
}

export const listTodoComments = async (
  db: Db,
  input: { organizationId: string; todoId: string }
): Promise<TodoCommentDto[]> => {
  try {
    const rows = await db
      .select(todoCommentSelection)
      .from(todoComments)
      .leftJoin(user, tenantSafeAuthorJoin)
      .where(
        and(
          eq(todoComments.organizationId, input.organizationId),
          eq(todoComments.todoId, input.todoId)
        )
      )
      .orderBy(asc(todoComments.createdAt))

    return rows.map(toTodoCommentDto)
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "listTodoComments",
    })
  }
}

export const insertTodoComment = async (
  db: Db,
  input: {
    organizationId: string
    todoId: string
    authorId: string
    body: string
  }
): Promise<TodoCommentDto> => {
  try {
    const rows = await db.transaction(async (tx) => {
      const insertedRows = await tx
        .insert(todoComments)
        .values({ id: crypto.randomUUID(), ...input })
        .returning()
      if (insertedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.authorId,
          action: "todo.comment.created",
          targetType: "todo_comment",
          targetId: insertedRows[0].id,
          metadata: { todoId: input.todoId },
        })
      }
      return insertedRows
    })
    const comment = rows[0]
    if (!comment) {
      throw new Error("insert returned no comment")
    }
    const hydrated = await findTodoCommentById(db, {
      organizationId: input.organizationId,
      todoId: input.todoId,
      commentId: comment.id,
    })
    if (!hydrated) {
      throw new Error("inserted comment could not be loaded")
    }
    return hydrated
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "insertTodoComment",
    })
  }
}

export const findTodoCommentById = async (
  db: Db,
  input: { organizationId: string; todoId: string; commentId: string }
): Promise<TodoCommentDto | null> => {
  try {
    const rows = await db
      .select(todoCommentSelection)
      .from(todoComments)
      .leftJoin(user, tenantSafeAuthorJoin)
      .where(
        and(
          eq(todoComments.id, input.commentId),
          eq(todoComments.todoId, input.todoId),
          eq(todoComments.organizationId, input.organizationId)
        )
      )
      .limit(1)
    return rows[0] ? toTodoCommentDto(rows[0]) : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "findTodoCommentById",
    })
  }
}

export const updateTodoCommentById = async (
  db: Db,
  input: {
    organizationId: string
    actorUserId: string
    todoId: string
    commentId: string
    body: string
  }
): Promise<TodoCommentDto | null> => {
  try {
    const rows = await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(todoComments)
        .set({ body: input.body, updatedAt: new Date() })
        .where(
          and(
            eq(todoComments.id, input.commentId),
            eq(todoComments.todoId, input.todoId),
            eq(todoComments.organizationId, input.organizationId)
          )
        )
        .returning()
      if (updatedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "todo.comment.updated",
          targetType: "todo_comment",
          targetId: input.commentId,
          metadata: { todoId: input.todoId },
        })
      }
      return updatedRows
    })
    if (!rows[0]) {
      return null
    }
    return findTodoCommentById(db, {
      organizationId: input.organizationId,
      todoId: input.todoId,
      commentId: input.commentId,
    })
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "updateTodoCommentById",
    })
  }
}

export const deleteTodoCommentById = async (
  db: Db,
  input: {
    actorUserId: string
    organizationId: string
    todoId: string
    commentId: string
  }
): Promise<TodoCommentDto | null> => {
  try {
    const current = await findTodoCommentById(db, input)
    if (!current) {
      return null
    }
    const rows = await db.transaction(async (tx) => {
      const deletedRows = await tx
        .delete(todoComments)
        .where(
          and(
            eq(todoComments.id, input.commentId),
            eq(todoComments.todoId, input.todoId),
            eq(todoComments.organizationId, input.organizationId)
          )
        )
        .returning()
      if (deletedRows[0]) {
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "todo.comment.deleted",
          targetType: "todo_comment",
          targetId: input.commentId,
          metadata: { todoId: input.todoId },
        })
      }
      return deletedRows
    })
    return rows[0] ? current : null
  } catch (cause) {
    throw publicErrors.internal(cause, {
      module: "todos",
      operation: "deleteTodoCommentById",
    })
  }
}
