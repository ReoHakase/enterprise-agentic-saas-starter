import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia, t } from "elysia"

import { getSessionUser } from "../auth/session"
import {
  createTodoBodyModel,
  deleteTodoBodyModel,
  deleteTodoParamsModel,
  listTodosQueryModel,
  todoModel,
  updateTodoBodyModel,
  updateTodoParamsModel,
} from "./model"
import { createTodo, deleteTodo, listTodos, updateTodo } from "./service"

export const createTodosModule = (db: Db) =>
  new Elysia({ name: "todos" })
    .get(
      "/todos",
      async ({ query, request }) => {
        const user = await getSessionUser(request)
        return listTodos(db, {
          userId: user.id,
          organizationId: query.organizationId,
        })
      },
      {
        query: listTodosQueryModel,
        response: t.Array(todoModel),
      }
    )
    .post(
      "/todos",
      async ({ body, request }) => {
        const user = await getSessionUser(request)
        return createTodo(db, {
          userId: user.id,
          organizationId: body.organizationId,
          title: body.title,
        })
      },
      {
        body: createTodoBodyModel,
        response: todoModel,
      }
    )
    .patch(
      "/todos/:id",
      async ({ body, params, request }) => {
        const user = await getSessionUser(request)
        return updateTodo(db, {
          userId: user.id,
          id: params.id,
          organizationId: body.organizationId,
          title: body.title,
          completed: body.completed,
        })
      },
      {
        params: updateTodoParamsModel,
        body: updateTodoBodyModel,
        response: todoModel,
      }
    )
    .delete(
      "/todos/:id",
      async ({ body, params, request }) => {
        const user = await getSessionUser(request)
        return deleteTodo(db, {
          userId: user.id,
          id: params.id,
          organizationId: body.organizationId,
        })
      },
      {
        params: deleteTodoParamsModel,
        body: deleteTodoBodyModel,
        response: todoModel,
      }
    )
