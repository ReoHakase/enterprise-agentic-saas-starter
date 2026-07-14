import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"

import { tenantErrorResponses } from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import {
  createTodoBodyModel,
  createTodoCommentBodyModel,
  deleteTodoBodyModel,
  deleteTodoCommentBodyModel,
  deleteTodoParamsModel,
  getTodoQueryModel,
  listTodoCommentsResponseModel,
  listTodosQueryModel,
  listTodosResponseModel,
  todoCommentModel,
  todoCommentParamsModel,
  todoModel,
  updateTodoBodyModel,
  updateTodoCommentBodyModel,
  updateTodoParamsModel,
} from "./model"
import {
  createTodo,
  createTodoComment,
  deleteTodo,
  deleteTodoComment,
  getTodo,
  getTodoComments,
  listTodos,
  updateTodo,
  updateTodoComment,
} from "./service"

export const createTodosModule = (db: Db) =>
  new Elysia({ name: "todos" })
    .use(createAccessControlModule(db))
    .get(
      "/todos",
      ({ authContext, organizationAccess, query }) =>
        listTodos(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          search: query.search,
          status: query.status,
          priority: query.priority,
          assigneeId: query.assigneeId,
          label: query.label,
          sortBy: query.sortBy,
          sortDirection: query.sortDirection,
          limit: query.limit,
        }),
      {
        organizationAccess: {
          action: "todo.list",
          source: "query",
        },
        query: listTodosQueryModel,
        response: { 200: listTodosResponseModel, ...tenantErrorResponses },
        detail: {
          operationId: "listTodos",
          summary: "issue一覧を検索・filter・sort",
          description:
            "active organizationだけを対象に、search/status/priority/assignee/label filterと安全なsortを適用する。最大100件。",
          tags: ["Todos"],
        },
      }
    )
    .get(
      "/todos/:id",
      ({ authContext, organizationAccess, params }) =>
        getTodo(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          id: params.id,
        }),
      {
        organizationAccess: {
          action: "todo.read",
          source: "query",
        },
        params: updateTodoParamsModel,
        query: getTodoQueryModel,
        response: { 200: todoModel, ...tenantErrorResponses },
        detail: {
          operationId: "getTodo",
          summary: "issue詳細を取得",
          description: "idとorganization idを常に組み合わせて検索する。",
          tags: ["Todos"],
        },
      }
    )
    .post(
      "/todos",
      async ({ authContext, body, organizationAccess, status }) =>
        status(
          201,
          await createTodo(db, {
            userId: authContext.user.id,
            organizationId: organizationAccess.id,
            title: body.title,
            description: body.description,
            status: body.status,
            priority: body.priority,
            assigneeId: body.assigneeId,
            labels: body.labels,
            dueDate: body.dueDate,
          })
        ),
      {
        organizationAccess: {
          action: "todo.create",
          source: "body",
        },
        body: createTodoBodyModel,
        response: { 201: todoModel, ...tenantErrorResponses },
        detail: {
          operationId: "createTodo",
          summary: "issueを作成",
          description:
            "creatorをsession userに固定し、organization内の次の連番をtransactionで採番する。assigneeは同じorganizationのmemberに限る。",
          tags: ["Todos"],
        },
      }
    )
    .patch(
      "/todos/:id",
      ({ authContext, body, organizationAccess, params }) =>
        updateTodo(db, {
          userId: authContext.user.id,
          id: params.id,
          organizationId: organizationAccess.id,
          title: body.title,
          description: body.description,
          status: body.status,
          priority: body.priority,
          assigneeId: body.assigneeId,
          labels: body.labels,
          dueDate: body.dueDate,
        }),
      {
        organizationAccess: {
          action: "todo.update",
          source: "body",
        },
        params: updateTodoParamsModel,
        body: updateTodoBodyModel,
        response: { 200: todoModel, ...tenantErrorResponses },
        detail: {
          operationId: "updateTodo",
          summary: "issueを更新",
          description:
            "検証済みorganization scope内のissue fieldsを更新し、tenant auditを同時に保存する。",
          tags: ["Todos"],
        },
      }
    )
    .delete(
      "/todos/:id",
      ({ authContext, organizationAccess, params }) =>
        deleteTodo(db, {
          userId: authContext.user.id,
          id: params.id,
          organizationId: organizationAccess.id,
        }),
      {
        organizationAccess: {
          action: "todo.delete",
          source: "body",
        },
        params: deleteTodoParamsModel,
        body: deleteTodoBodyModel,
        response: { 200: todoModel, ...tenantErrorResponses },
        detail: {
          operationId: "deleteTodo",
          summary: "issueを削除",
          description:
            "memberは自分が作成したissueだけ、admin以上はorganization内のissueを削除できる。",
          tags: ["Todos"],
        },
      }
    )
    .get(
      "/todos/:id/comments",
      ({ authContext, organizationAccess, params }) =>
        getTodoComments(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          todoId: params.id,
        }),
      {
        organizationAccess: {
          action: "todo.comment.list",
          source: "query",
        },
        params: updateTodoParamsModel,
        query: getTodoQueryModel,
        response: {
          200: listTodoCommentsResponseModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "listTodoComments",
          summary: "issue comment一覧を取得",
          description:
            "検証済みorganizationとissueに属するcommentだけをauthor表示情報付きで返す。",
          tags: ["Todo comments"],
        },
      }
    )
    .post(
      "/todos/:id/comments",
      async ({ authContext, body, organizationAccess, params, status }) =>
        status(
          201,
          await createTodoComment(db, {
            userId: authContext.user.id,
            organizationId: organizationAccess.id,
            todoId: params.id,
            body: body.body,
          })
        ),
      {
        organizationAccess: {
          action: "todo.comment.create",
          source: "body",
        },
        params: updateTodoParamsModel,
        body: createTodoCommentBodyModel,
        response: { 201: todoCommentModel, ...tenantErrorResponses },
        detail: {
          operationId: "createTodoComment",
          summary: "issueへcommentを追加",
          description:
            "検証済みorganizationとissueへcommentを追加し、tenant auditを同時に保存する。",
          tags: ["Todo comments"],
        },
      }
    )
    .patch(
      "/todos/:id/comments/:commentId",
      ({ authContext, body, organizationAccess, params }) =>
        updateTodoComment(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          todoId: params.id,
          commentId: params.commentId,
          body: body.body,
        }),
      {
        organizationAccess: {
          action: "todo.comment.update",
          source: "body",
        },
        params: todoCommentParamsModel,
        body: updateTodoCommentBodyModel,
        response: { 200: todoCommentModel, ...tenantErrorResponses },
        detail: {
          operationId: "updateTodoComment",
          summary: "issue commentを更新",
          description: "author本人またはadmin以上だけが更新できる。",
          tags: ["Todo comments"],
        },
      }
    )
    .delete(
      "/todos/:id/comments/:commentId",
      ({ authContext, organizationAccess, params }) =>
        deleteTodoComment(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          todoId: params.id,
          commentId: params.commentId,
        }),
      {
        organizationAccess: {
          action: "todo.comment.delete",
          source: "body",
        },
        params: todoCommentParamsModel,
        body: deleteTodoCommentBodyModel,
        response: { 200: todoCommentModel, ...tenantErrorResponses },
        detail: {
          operationId: "deleteTodoComment",
          summary: "issue commentを削除",
          description: "author本人またはadmin以上だけが削除できる。",
          tags: ["Todo comments"],
        },
      }
    )
