import { t } from "elysia"

export const todoModel = t.Object({
  id: t.String(),
  organizationId: t.String(),
  title: t.String(),
  completed: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
})

export const listTodosQueryModel = t.Object({
  organizationId: t.String(),
})

export const createTodoBodyModel = t.Object({
  organizationId: t.String(),
  title: t.String(),
})

export const updateTodoParamsModel = t.Object({
  id: t.String(),
})

export const updateTodoBodyModel = t.Object({
  organizationId: t.String(),
  title: t.Optional(t.String()),
  completed: t.Optional(t.Boolean()),
})

export const deleteTodoParamsModel = t.Object({
  id: t.String(),
})

export const deleteTodoBodyModel = t.Object({
  organizationId: t.String(),
})
