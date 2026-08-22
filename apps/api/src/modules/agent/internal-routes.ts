import { Elysia } from "elysia"
import * as v from "valibot"

import { HttpError } from "../../errors/http-error"
import { errorPlugin } from "../../platform/plugins/error"
import { observabilityPlugin } from "../../platform/plugins/observability"
import { requestIdPlugin } from "../../platform/plugins/request-id"
import { agentInternalAuthorizationModel } from "./action-schema"
import {
  actionIdParamsModel,
  assetIdParamsModel,
  authorizeWebSearchBodyModel,
  emptyBodyModel,
  finalizeRunBodyModel,
  issueAttachmentParamsModel,
  issueAttachmentQueryModel,
  issueIdParamsModel,
  issueNumberParamsModel,
  issueSearchQueryModel,
  labelSearchQueryModel,
  memberSearchQueryModel,
  prepareIssueActionBodyModel,
  resumeApprovedActionBodyModel,
  startChatRunBodyModel,
} from "./internal-schema"
import type { AgentInternalService } from "./internal-service"
import { consumeConnectionTicketInputModel } from "./runtime-schema"

const bearerGrant = (request: Request): string => {
  const result = v.safeParse(agentInternalAuthorizationModel, {
    authorization: request.headers.get("authorization") ?? "",
  })
  if (!result.success) throw new HttpError({ code: "unauthorized" })
  return result.output.authorization.slice("Bearer ".length)
}

/**
 * Agent Workerからnamed Service Bindingでだけ到達できるprivate Elysia app。
 * public `createApp`、CORS、OpenAPI、Better Auth/CSRFへはmountしない。
 */
export const createAgentInternalRoutes = (service: AgentInternalService) =>
  new Elysia({ name: "agent-internal" })
    .use(requestIdPlugin)
    .use(observabilityPlugin)
    .use(errorPlugin)
    .onRequest(({ request, set }) => {
      set.headers["cache-control"] = "private, no-store"
      const url = new URL(request.url)
      const isTicketRequest =
        request.method === "POST" &&
        (url.pathname === "/internal/agent/connections/consume" ||
          url.pathname === "/internal/agent/runs/start")
      const isActionResume =
        request.method === "POST" &&
        /^\/internal\/agent\/actions\/[A-Za-z0-9_-]{1,128}\/resume$/u.test(
          url.pathname
        )
      if (!isTicketRequest && !isActionResume) {
        bearerGrant(request)
      }
    })
    .group("/internal/agent", (app) =>
      app
        .post(
          "/connections/consume",
          ({ body }) => service.consumeConnectionTicket(body),
          { body: consumeConnectionTicketInputModel }
        )
        .post("/runs/start", ({ body }) => service.startChatRun(body), {
          body: startChatRunBodyModel,
        })
        .post(
          "/runs/live",
          ({ request }) =>
            service.assertRunLive({ grant: bearerGrant(request) }),
          { body: emptyBodyModel }
        )
        .post(
          "/runs/web-search/authorize",
          ({ body, request }) =>
            service.authorizeWebSearch({
              ...body,
              grant: bearerGrant(request),
            }),
          { body: authorizeWebSearchBodyModel }
        )
        .post(
          "/runs/finalize",
          ({ body, request }) =>
            service.finalizeRun({ ...body, grant: bearerGrant(request) }),
          { body: finalizeRunBodyModel }
        )
        .get("/context/account", ({ request }) =>
          service.readAccountContext({ grant: bearerGrant(request) })
        )
        .get("/context/organization", ({ request }) =>
          service.readActiveOrganization({ grant: bearerGrant(request) })
        )
        .get(
          "/members",
          ({ query, request }) =>
            service.searchOrganizationMembers({
              grant: bearerGrant(request),
              limit: query.limit,
              query: query.query,
            }),
          { query: memberSearchQueryModel }
        )
        .get(
          "/issue-labels",
          ({ query, request }) =>
            service.searchIssueLabels({
              grant: bearerGrant(request),
              limit: query.limit,
              query: query.query,
            }),
          { query: labelSearchQueryModel }
        )
        .get(
          "/issues",
          ({ query, request }) =>
            service.searchIssues({
              ...query,
              grant: bearerGrant(request),
            }),
          { query: issueSearchQueryModel }
        )
        .get(
          "/issues/by-number/:number",
          ({ params, query, request }) =>
            service.getIssue({
              attachmentCursor: query.attachmentCursor,
              attachmentLimit: query.attachmentLimit,
              grant: bearerGrant(request),
              lookup: "number",
              number: params.number,
            }),
          {
            params: issueNumberParamsModel,
            query: issueAttachmentQueryModel,
          }
        )
        .get(
          "/issues/:issueId/attachments/:fileId/model",
          ({ params, request }) =>
            service.getIssueAttachmentImageForModel({
              fileId: params.fileId,
              grant: bearerGrant(request),
              issueId: params.issueId,
            }),
          { params: issueAttachmentParamsModel }
        )
        .get(
          "/issues/:issueId",
          ({ params, query, request }) =>
            service.getIssue({
              attachmentCursor: query.attachmentCursor,
              attachmentLimit: query.attachmentLimit,
              grant: bearerGrant(request),
              lookup: "id",
              id: params.issueId,
            }),
          {
            params: issueIdParamsModel,
            query: issueAttachmentQueryModel,
          }
        )
        .post(
          "/actions",
          ({ body, request }) => {
            const grant = bearerGrant(request)
            switch (body.kind) {
              case "create_issue":
                return service.prepareCreateIssue({
                  grant,
                  idempotencyKey: body.idempotencyKey,
                  issue: body.issue,
                  toolCallId: body.toolCallId,
                })
              case "update_issue":
                return service.prepareUpdateIssue({
                  grant,
                  idempotencyKey: body.idempotencyKey,
                  issue: body.issue,
                  toolCallId: body.toolCallId,
                })
              case "delete_issue":
                return service.prepareDeleteIssue({
                  grant,
                  idempotencyKey: body.idempotencyKey,
                  issue: body.issue,
                  toolCallId: body.toolCallId,
                })
            }
          },
          { body: prepareIssueActionBodyModel }
        )
        .post(
          "/actions/:actionId/resume",
          ({ body, params }) =>
            service.resumeApprovedAction({
              actionId: params.actionId,
              resumeTicket: body.resumeTicket,
            }),
          {
            body: resumeApprovedActionBodyModel,
            params: actionIdParamsModel,
          }
        )
        .post(
          "/actions/:actionId/execute",
          ({ params, request }) =>
            service.executeApprovedAction({
              actionId: params.actionId,
              grant: bearerGrant(request),
            }),
          { body: emptyBodyModel, params: actionIdParamsModel }
        )
        .get(
          "/assets/:assetId/model",
          ({ params, request }) =>
            service.getAgentImageForModel({
              assetId: params.assetId,
              grant: bearerGrant(request),
            }),
          { params: assetIdParamsModel }
        )
    )

export type AgentInternalApp = ReturnType<typeof createAgentInternalRoutes>
