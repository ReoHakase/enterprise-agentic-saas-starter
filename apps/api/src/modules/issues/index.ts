import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"

import { tenantErrorResponses } from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import {
  createIssueBodyModel,
  createIssueCommentBodyModel,
  deleteIssueBodyModel,
  deleteIssueCommentBodyModel,
  deleteIssueParamsModel,
  getIssueQueryModel,
  getIssueByNumberParamsModel,
  issueThumbnailModel,
  issueTimelinePageModel,
  issueTimelineQueryModel,
  listIssueCommentsResponseModel,
  listIssuesQueryModel,
  listIssuesResponseModel,
  issueCommentModel,
  issueCommentParamsModel,
  issueModel,
  updateIssueBodyModel,
  updateIssueCommentBodyModel,
  updateIssueParamsModel,
  updateIssueThumbnailBodyModel,
} from "./model"
import {
  createIssue,
  createIssueComment,
  deleteIssue,
  deleteIssueComment,
  getIssue,
  getIssueByNumber,
  getIssueComments,
  getIssueTimeline,
  getIssueThumbnail,
  listIssues,
  updateIssue,
  updateIssueComment,
  updateIssueThumbnail,
} from "./service"

export const createIssuesModule = (db: Db) =>
  new Elysia({ name: "issues" })
    .use(createAccessControlModule(db))
    .get(
      "/issues",
      ({ authContext, organizationAccess, query }) =>
        listIssues(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          search: query.search,
          status: query.status,
          priority: query.priority,
          assigneeId: query.assigneeId,
          label: query.label,
          sortBy: query.sortBy,
          sortDirection: query.sortDirection,
          page: query.page,
        }),
      {
        organizationAccess: {
          action: "issue.list",
          source: "query",
        },
        query: listIssuesQueryModel,
        response: { 200: listIssuesResponseModel, ...tenantErrorResponses },
        detail: {
          operationId: "listIssues",
          summary: "issue一覧を検索・filter・sort",
          description:
            "active organizationだけを対象に、search/status/priority/assignee/label filterと決定的なsortを適用し、10件単位のpageを返す。",
          tags: ["Issues"],
        },
      }
    )
    .get(
      "/issues/by-number/:number",
      ({ authContext, organizationAccess, params }) =>
        getIssueByNumber(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          number: params.number,
        }),
      {
        organizationAccess: {
          action: "issue.read",
          source: "query",
        },
        params: getIssueByNumberParamsModel,
        query: getIssueQueryModel,
        response: { 200: issueModel, ...tenantErrorResponses },
        detail: {
          operationId: "getIssueByNumber",
          summary: "organization内のissue番号で詳細を取得",
          description:
            "organization scopeと連番を組み合わせ、他tenantの存在を漏らさず取得する。",
          tags: ["Issues"],
        },
      }
    )
    .get(
      "/issues/:id",
      ({ authContext, organizationAccess, params }) =>
        getIssue(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          id: params.id,
        }),
      {
        organizationAccess: {
          action: "issue.read",
          source: "query",
        },
        params: updateIssueParamsModel,
        query: getIssueQueryModel,
        response: { 200: issueModel, ...tenantErrorResponses },
        detail: {
          operationId: "getIssue",
          summary: "issue詳細を取得",
          description: "idとorganization idを常に組み合わせて検索する。",
          tags: ["Issues"],
        },
      }
    )
    .get(
      "/issues/:id/thumbnail",
      ({ authContext, organizationAccess, params }) =>
        getIssueThumbnail(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          issueId: params.id,
        }),
      {
        organizationAccess: {
          action: "issue.read",
          source: "query",
        },
        params: updateIssueParamsModel,
        query: getIssueQueryModel,
        response: { 200: issueThumbnailModel, ...tenantErrorResponses },
        detail: {
          operationId: "getIssueThumbnail",
          summary: "issueの有効なthumbnailを取得",
          description:
            "明示選択があればそれを、なければ最古のpreview可能な添付画像を返す。",
          tags: ["Issues"],
        },
      }
    )
    .put(
      "/issues/:id/thumbnail",
      ({ authContext, body, organizationAccess, params }) =>
        updateIssueThumbnail(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          issueId: params.id,
          fileId: body.fileId,
        }),
      {
        organizationAccess: {
          action: "issue.update",
          source: "body",
        },
        params: updateIssueParamsModel,
        body: updateIssueThumbnailBodyModel,
        response: { 200: issueThumbnailModel, ...tenantErrorResponses },
        detail: {
          operationId: "updateIssueThumbnail",
          summary: "issueのthumbnail選択を更新",
          description:
            "Issueに属するpreview可能な画像を選択する。nullで最古画像の自動選択へ戻す。",
          tags: ["Issues"],
        },
      }
    )
    .get(
      "/issues/:id/timeline",
      ({ authContext, organizationAccess, params, query }) =>
        getIssueTimeline(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          issueId: params.id,
          cursor: query.cursor,
          limit: query.limit,
        }),
      {
        organizationAccess: {
          action: "issue.read",
          source: "query",
        },
        params: updateIssueParamsModel,
        query: issueTimelineQueryModel,
        response: { 200: issueTimelinePageModel, ...tenantErrorResponses },
        detail: {
          operationId: "getIssueTimeline",
          summary: "issueの変更履歴とcommentを取得",
          description:
            "tenant-safeなactor情報を付け、変更履歴とcommentを新しい順でpage取得する。",
          tags: ["Issues"],
        },
      }
    )
    .post(
      "/issues",
      async ({ authContext, body, organizationAccess, status }) =>
        status(
          201,
          await createIssue(db, {
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
          action: "issue.create",
          source: "body",
        },
        body: createIssueBodyModel,
        response: { 201: issueModel, ...tenantErrorResponses },
        detail: {
          operationId: "createIssue",
          summary: "issueを作成",
          description:
            "creatorをsession userに固定し、organization内の次の連番をtransactionで採番する。assigneeは同じorganizationのmemberに限る。",
          tags: ["Issues"],
        },
      }
    )
    .patch(
      "/issues/:id",
      ({ authContext, body, organizationAccess, params }) =>
        updateIssue(db, {
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
          action: "issue.update",
          source: "body",
        },
        params: updateIssueParamsModel,
        body: updateIssueBodyModel,
        response: { 200: issueModel, ...tenantErrorResponses },
        detail: {
          operationId: "updateIssue",
          summary: "issueを更新",
          description:
            "検証済みorganization scope内のissue fieldsを更新し、tenant auditを同時に保存する。",
          tags: ["Issues"],
        },
      }
    )
    .delete(
      "/issues/:id",
      ({ authContext, organizationAccess, params }) =>
        deleteIssue(db, {
          userId: authContext.user.id,
          id: params.id,
          organizationId: organizationAccess.id,
        }),
      {
        organizationAccess: {
          action: "issue.delete",
          source: "body",
        },
        params: deleteIssueParamsModel,
        body: deleteIssueBodyModel,
        response: { 200: issueModel, ...tenantErrorResponses },
        detail: {
          operationId: "deleteIssue",
          summary: "issueを削除",
          description:
            "memberは自分が作成したissueだけ、admin以上はorganization内のissueを削除できる。",
          tags: ["Issues"],
        },
      }
    )
    .get(
      "/issues/:id/comments",
      ({ authContext, organizationAccess, params }) =>
        getIssueComments(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          issueId: params.id,
        }),
      {
        organizationAccess: {
          action: "issue.comment.list",
          source: "query",
        },
        params: updateIssueParamsModel,
        query: getIssueQueryModel,
        response: {
          200: listIssueCommentsResponseModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "listIssueComments",
          summary: "issue comment一覧を取得",
          description:
            "検証済みorganizationとissueに属するcommentだけをauthor表示情報付きで返す。",
          tags: ["Issue comments"],
        },
      }
    )
    .post(
      "/issues/:id/comments",
      async ({ authContext, body, organizationAccess, params, status }) =>
        status(
          201,
          await createIssueComment(db, {
            userId: authContext.user.id,
            organizationId: organizationAccess.id,
            issueId: params.id,
            body: body.body,
          })
        ),
      {
        organizationAccess: {
          action: "issue.comment.create",
          source: "body",
        },
        params: updateIssueParamsModel,
        body: createIssueCommentBodyModel,
        response: { 201: issueCommentModel, ...tenantErrorResponses },
        detail: {
          operationId: "createIssueComment",
          summary: "issueへcommentを追加",
          description:
            "検証済みorganizationとissueへcommentを追加し、tenant auditを同時に保存する。",
          tags: ["Issue comments"],
        },
      }
    )
    .patch(
      "/issues/:id/comments/:commentId",
      ({ authContext, body, organizationAccess, params }) =>
        updateIssueComment(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          issueId: params.id,
          commentId: params.commentId,
          body: body.body,
        }),
      {
        organizationAccess: {
          action: "issue.comment.update",
          source: "body",
        },
        params: issueCommentParamsModel,
        body: updateIssueCommentBodyModel,
        response: { 200: issueCommentModel, ...tenantErrorResponses },
        detail: {
          operationId: "updateIssueComment",
          summary: "issue commentを更新",
          description: "author本人またはadmin以上だけが更新できる。",
          tags: ["Issue comments"],
        },
      }
    )
    .delete(
      "/issues/:id/comments/:commentId",
      ({ authContext, organizationAccess, params }) =>
        deleteIssueComment(db, {
          userId: authContext.user.id,
          organizationId: organizationAccess.id,
          issueId: params.id,
          commentId: params.commentId,
        }),
      {
        organizationAccess: {
          action: "issue.comment.delete",
          source: "body",
        },
        params: issueCommentParamsModel,
        body: deleteIssueCommentBodyModel,
        response: { 200: issueCommentModel, ...tenantErrorResponses },
        detail: {
          operationId: "deleteIssueComment",
          summary: "issue commentを削除",
          description: "author本人またはadmin以上だけが削除できる。",
          tags: ["Issue comments"],
        },
      }
    )
