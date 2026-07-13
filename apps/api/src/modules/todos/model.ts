import { t } from "elysia"

export const todoStatusModel = t.Union([
  t.Literal("open"),
  t.Literal("in_progress"),
  t.Literal("closed"),
])

export const todoPriorityModel = t.Union([
  t.Literal("no_priority"),
  t.Literal("low"),
  t.Literal("medium"),
  t.Literal("high"),
  t.Literal("urgent"),
])

const organizationIdModel = t.String({
  minLength: 1,
  description: "active organization id",
  examples: ["org_01JQ8YF2J7Q0J2X8R8S3Q9M6P4"],
})

const labelsModel = t.Array(t.String({ minLength: 1, maxLength: 40 }), {
  maxItems: 20,
  uniqueItems: true,
})

export const todoModel = t.Object(
  {
    id: t.String(),
    organizationId: t.String(),
    number: t.Integer({ minimum: 1 }),
    title: t.String(),
    description: t.String(),
    status: todoStatusModel,
    priority: todoPriorityModel,
    assigneeId: t.Nullable(t.String()),
    creatorId: t.String(),
    labels: labelsModel,
    dueDate: t.Nullable(t.String({ format: "date-time" })),
    createdAt: t.String({ format: "date-time" }),
    updatedAt: t.String({ format: "date-time" }),
  },
  {
    $id: "TodoIssue",
    description: "organization内で連番を持つissue相当のtodo",
  }
)

export const listTodosQueryModel = t.Object({
  organizationId: organizationIdModel,
  search: t.Optional(t.String({ maxLength: 200 })),
  status: t.Optional(todoStatusModel),
  priority: t.Optional(todoPriorityModel),
  assigneeId: t.Optional(t.String()),
  label: t.Optional(t.String({ maxLength: 40 })),
  sortBy: t.Optional(
    t.Union([
      t.Literal("number"),
      t.Literal("createdAt"),
      t.Literal("updatedAt"),
      t.Literal("dueDate"),
      t.Literal("priority"),
      t.Literal("status"),
    ])
  ),
  sortDirection: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
})

export const getTodoQueryModel = t.Object({
  organizationId: organizationIdModel,
})

export const createTodoBodyModel = t.Object({
  organizationId: organizationIdModel,
  title: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 50_000 })),
  status: t.Optional(todoStatusModel),
  priority: t.Optional(todoPriorityModel),
  assigneeId: t.Optional(t.Nullable(t.String())),
  labels: t.Optional(labelsModel),
  dueDate: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
})

export const updateTodoParamsModel = t.Object({ id: t.String() })

export const updateTodoBodyModel = t.Object({
  organizationId: organizationIdModel,
  title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  description: t.Optional(t.String({ maxLength: 50_000 })),
  status: t.Optional(todoStatusModel),
  priority: t.Optional(todoPriorityModel),
  assigneeId: t.Optional(t.Nullable(t.String())),
  labels: t.Optional(labelsModel),
  dueDate: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
})

export const deleteTodoParamsModel = t.Object({ id: t.String() })
export const deleteTodoBodyModel = t.Object({
  organizationId: organizationIdModel,
})

export const todoCommentModel = t.Object(
  {
    id: t.String(),
    organizationId: t.String(),
    todoId: t.String(),
    authorId: t.String(),
    author: t.Object({
      id: t.String(),
      name: t.String(),
      image: t.Nullable(t.String()),
    }),
    body: t.String(),
    createdAt: t.String({ format: "date-time" }),
    updatedAt: t.String({ format: "date-time" }),
  },
  { $id: "TodoComment" }
)

export const todoCommentParamsModel = t.Object({
  id: t.String(),
  commentId: t.String(),
})

export const createTodoCommentBodyModel = t.Object({
  organizationId: organizationIdModel,
  body: t.String({ minLength: 1, maxLength: 20_000 }),
})

export const updateTodoCommentBodyModel = createTodoCommentBodyModel
export const deleteTodoCommentBodyModel = t.Object({
  organizationId: organizationIdModel,
})
