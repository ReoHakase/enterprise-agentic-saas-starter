import { Elysia } from "elysia"

import { tenantErrorResponses } from "../../models/api"
import type { AccessControlFactory } from "../authorization/public"
import {
  createIssueBodyModel,
  createIssueCommentBodyModel,
  deleteIssueBodyModel,
  deleteIssueCommentBodyModel,
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
  updateIssueParamsModel,
  updateIssueThumbnailBodyModel,
} from "./model"
import type { IssuesService } from "./service"

const createIssueReadRoutes = (
  service: IssuesService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "issue-read-routes" })
    .use(createAccessControl())
    .get(
      "/issues",
      ({ authContext, organizationAccess, query }) =>
        service.listIssues({
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
          summary: "List and filter organization issues",
          description:
            "Returns a ten-item page from the active organization after applying search, status, priority, assignee, and label filters with deterministic sorting. Resources in another tenant are never considered.",
          tags: ["Issues"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/issues/by-number/:number",
      ({ authContext, organizationAccess, params }) =>
        service.getIssueByNumber({
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
          summary: "Retrieve an issue by organization number",
          description:
            "Retrieves one issue by combining its organization-scoped sequence number with the active tenant boundary. A number belonging to another tenant is projected as not found.",
          tags: ["Issues"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/issues/:id",
      ({ authContext, organizationAccess, params }) =>
        service.getIssue({
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
          summary: "Retrieve an issue by identifier",
          description:
            "Retrieves one issue by combining its stable identifier with the active organization identifier. Cross-tenant resources are projected as not found without revealing their existence.",
          tags: ["Issues"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/issues/:id/thumbnail",
      ({ authContext, organizationAccess, params }) =>
        service.getIssueThumbnail({
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
          summary: "Retrieve the effective issue thumbnail",
          description:
            "Returns the explicitly selected tenant-safe thumbnail when present, otherwise the oldest previewable image attached to the issue. Private object keys and storage URLs are not exposed.",
          tags: ["Issues"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .put(
      "/issues/:id/thumbnail",
      ({ authContext, body, organizationAccess, params }) =>
        service.updateIssueThumbnail({
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
          summary: "Update the selected issue thumbnail",
          description:
            "Selects a previewable image already attached to the issue in the active organization. Supplying null restores deterministic automatic selection of the oldest eligible image.",
          tags: ["Issues"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/issues/:id/timeline",
      ({ authContext, organizationAccess, params, query }) =>
        service.getIssueTimeline({
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
          summary: "List an issue timeline",
          description:
            "Returns a cursor-paginated timeline of changes and comments in reverse chronological order with tenant-safe actor projections. The opaque next cursor preserves a total ordering.",
          tags: ["Issues"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )

const createIssueMutationRoutes = (
  service: IssuesService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "issue-mutation-routes" })
    .use(createAccessControl())
    .post(
      "/issues",
      async ({ authContext, body, organizationAccess, status }) =>
        status(
          201,
          await service.createIssue({
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
          summary: "Create an organization issue",
          description:
            "Creates an issue in the active organization, fixes the creator to the authenticated user, and allocates the next tenant sequence number transactionally. Any assignee must be a current member.",
          tags: ["Issues"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .patch(
      "/issues/:id",
      ({ authContext, body, organizationAccess, params }) =>
        service.updateIssue({
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
          summary: "Update an organization issue",
          description:
            "Updates validated fields on an issue in the active organization and persists the corresponding tenant audit event in the same transaction. Cross-tenant identifiers are rejected.",
          tags: ["Issues"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/issues/:id",
      ({ authContext, organizationAccess, params }) =>
        service.deleteIssue({
          userId: authContext.user.id,
          id: params.id,
          organizationId: organizationAccess.id,
        }),
      {
        organizationAccess: {
          action: "issue.delete",
          source: "body",
        },
        params: updateIssueParamsModel,
        body: deleteIssueBodyModel,
        response: { 200: issueModel, ...tenantErrorResponses },
        detail: {
          operationId: "deleteIssue",
          summary: "Delete an organization issue",
          description:
            "Deletes an issue from the active organization. Members may delete only issues they created, while administrators and super administrators may delete any issue in that tenant.",
          tags: ["Issues"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )

export const createIssuesRoutes = (
  service: IssuesService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "issues" })
    .use(createIssueReadRoutes(service, createAccessControl))
    .use(createIssueMutationRoutes(service, createAccessControl))
    .get(
      "/issues/:id/comments",
      ({ authContext, organizationAccess, params }) =>
        service.getIssueComments({
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
          summary: "List comments on an issue",
          description:
            "Lists comments belonging to the validated issue and active organization with tenant-safe author display information. Profiles from former or external members are not disclosed.",
          tags: ["Issue comments"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/issues/:id/comments",
      async ({ authContext, body, organizationAccess, params, status }) =>
        status(
          201,
          await service.createIssueComment({
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
          summary: "Create a comment on an issue",
          description:
            "Creates a comment on the validated issue in the active organization and records the tenant audit event in the same transaction. The authenticated user is fixed as the author.",
          tags: ["Issue comments"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .patch(
      "/issues/:id/comments/:commentId",
      ({ authContext, body, organizationAccess, params }) =>
        service.updateIssueComment({
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
        body: createIssueCommentBodyModel,
        response: { 200: issueCommentModel, ...tenantErrorResponses },
        detail: {
          operationId: "updateIssueComment",
          summary: "Update an issue comment",
          description:
            "Updates a comment only when the authenticated user is its author or an administrator of the active organization. The issue, comment, and tenant identifiers are checked together.",
          tags: ["Issue comments"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .delete(
      "/issues/:id/comments/:commentId",
      ({ authContext, organizationAccess, params }) =>
        service.deleteIssueComment({
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
          summary: "Delete an issue comment",
          description:
            "Deletes a comment only when the authenticated user is its author or an administrator of the active organization. The deletion also records a tenant-scoped audit event.",
          tags: ["Issue comments"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
