import * as v from "valibot"

import {
  dateOnlyModel,
  isoTimestampModel,
  nonEmptyStringModel,
  positiveIntegerQueryModel,
} from "../../models/common"

export const todoStatusModel = v.picklist(["open", "in_progress", "closed"])

export const todoPriorityModel = v.picklist([
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
])

const organizationIdModel = v.pipe(
  nonEmptyStringModel,
  v.metadata({
    description: "active organization id",
    examples: ["org_01JQ8YF2J7Q0J2X8R8S3Q9M6P4"],
  })
)

const labelsModel = v.pipe(
  v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(40))),
  v.maxLength(20)
)

export const todoModel = v.pipe(
  v.object({
    id: v.string(),
    organizationId: v.string(),
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    title: v.string(),
    description: v.string(),
    status: todoStatusModel,
    priority: todoPriorityModel,
    assigneeId: v.nullable(v.string()),
    creatorId: v.string(),
    labels: labelsModel,
    dueDate: v.nullable(dateOnlyModel),
    createdAt: isoTimestampModel,
    updatedAt: isoTimestampModel,
  }),
  v.metadata({
    title: "TodoIssue",
    description: "organization内で連番を持つissue相当のtodo",
  })
)

export const listTodosResponseModel = v.array(todoModel)

export const listTodosQueryModel = v.object({
  organizationId: organizationIdModel,
  search: v.optional(v.pipe(v.string(), v.maxLength(200))),
  status: v.optional(todoStatusModel),
  priority: v.optional(todoPriorityModel),
  assigneeId: v.optional(v.string()),
  label: v.optional(v.pipe(v.string(), v.maxLength(40))),
  sortBy: v.optional(
    v.picklist([
      "number",
      "createdAt",
      "updatedAt",
      "dueDate",
      "priority",
      "status",
    ])
  ),
  sortDirection: v.optional(v.picklist(["asc", "desc"])),
  limit: v.optional(positiveIntegerQueryModel(100)),
})

export const getTodoQueryModel = v.object({
  organizationId: organizationIdModel,
})

export const createTodoBodyModel = v.object({
  organizationId: organizationIdModel,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  description: v.optional(v.pipe(v.string(), v.maxLength(50_000))),
  status: v.optional(todoStatusModel),
  priority: v.optional(todoPriorityModel),
  assigneeId: v.optional(v.nullable(v.string())),
  labels: v.optional(labelsModel),
  dueDate: v.optional(v.nullable(dateOnlyModel)),
})

export const updateTodoParamsModel = v.object({ id: nonEmptyStringModel })

export const updateTodoBodyModel = v.object({
  organizationId: organizationIdModel,
  title: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
  description: v.optional(v.pipe(v.string(), v.maxLength(50_000))),
  status: v.optional(todoStatusModel),
  priority: v.optional(todoPriorityModel),
  assigneeId: v.optional(v.nullable(v.string())),
  labels: v.optional(labelsModel),
  dueDate: v.optional(v.nullable(dateOnlyModel)),
})

export const deleteTodoParamsModel = updateTodoParamsModel
export const deleteTodoBodyModel = v.object({
  organizationId: organizationIdModel,
})

export const todoCommentModel = v.pipe(
  v.object({
    id: v.string(),
    organizationId: v.string(),
    todoId: v.string(),
    authorId: v.string(),
    author: v.object({
      id: v.string(),
      name: v.string(),
      image: v.nullable(v.string()),
    }),
    body: v.string(),
    createdAt: isoTimestampModel,
    updatedAt: isoTimestampModel,
  }),
  v.metadata({ title: "TodoComment" })
)

export const listTodoCommentsResponseModel = v.array(todoCommentModel)

export const todoCommentParamsModel = v.object({
  id: nonEmptyStringModel,
  commentId: nonEmptyStringModel,
})

export const createTodoCommentBodyModel = v.object({
  organizationId: organizationIdModel,
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(20_000)),
})

export const updateTodoCommentBodyModel = createTodoCommentBodyModel
export const deleteTodoCommentBodyModel = v.object({
  organizationId: organizationIdModel,
})
