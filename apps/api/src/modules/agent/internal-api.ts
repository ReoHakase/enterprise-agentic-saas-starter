import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"
import * as v from "valibot"

import { publicErrors } from "../../errors/app-error"
import { errorPlugin } from "../../plugins/error"
import { observabilityPlugin } from "../../plugins/observability"
import { requestIdPlugin } from "../../plugins/request-id"
import { getAgentImageForModel } from "../files/agent-assets-service"
import { getIssueAttachmentImageForModel } from "../files/agent-issue-attachments-service"
import { FILE_LIST_MAX_LIMIT } from "../files/constants"
import {
  executeAgentApprovedAction,
  getAgentIssueActionDecision,
  prepareCreateIssueAction,
  prepareDeleteIssueAction,
  prepareUpdateIssueAction,
  resumeAgentApprovedAction,
} from "./actions/repository"
import {
  agentGrantInputModel,
  agentInternalAuthorizationModel,
  appendAgentRunMessagesInputModel,
  consumeConnectionTicketInputModel,
  executeApprovedActionInputModel,
  finishAgentRunInputModel,
  getAgentImageInputModel,
  getAgentIssueAttachmentImageInputModel,
  getAgentIssueInputModel,
  getIssueActionDecisionInputModel,
  guardAgentWebSearchInputModel,
  prepareCreateIssueInputModel,
  prepareDeleteIssueInputModel,
  prepareUpdateIssueInputModel,
  recordAgentUsageInputModel,
  recordAgentUsageObjectModel,
  renameAgentThreadInputModel,
  reserveAgentWebSearchInputModel,
  resumeApprovedActionInputModel,
  searchAgentIssuesInputModel,
  searchAgentLabelsInputModel,
  searchAgentMembersInputModel,
  startAgentRunInputModel,
} from "./model"
import {
  guardAgentWebSearchQuery,
  reserveAgentWebSearch,
} from "./runs/web-search"
import {
  appendAgentRunMessages,
  cancelAgentRun,
  consumeAgentConnectionTicket,
  finishAgentRun,
  getAgentIssue,
  readAgentAccountContext,
  readAgentActiveOrganization,
  renameAgentThreadForRun,
  searchAgentIssueLabels,
  searchAgentIssues,
  searchAgentOrganizationMembers,
  startAgentRun,
} from "./threads/repository"
import { recordAgentUsage } from "./usage/repository"

const identifierModel = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9_-]+$/)
)

const positiveIntegerQueryModel = v.pipe(
  v.string(),
  v.regex(/^[1-9][0-9]*$/),
  v.transform(Number),
  v.integer(),
  v.minValue(1),
  v.maxValue(2_147_483_647)
)

const limitQueryModel = v.optional(
  v.pipe(positiveIntegerQueryModel, v.maxValue(50))
)

const emptyBodyModel = v.strictObject({})
const startRunBodyModel = v.omit(startAgentRunInputModel, ["grant"])
const reserveWebSearchBodyModel = v.omit(reserveAgentWebSearchInputModel, [
  "grant",
])
const guardWebSearchBodyModel = v.omit(guardAgentWebSearchInputModel, ["grant"])
const finishRunBodyModel = v.omit(finishAgentRunInputModel, ["grant"])
const renameThreadBodyModel = v.omit(renameAgentThreadInputModel, ["grant"])
const recordUsageBodyModel = v.omit(recordAgentUsageObjectModel, ["grant"])
const appendRunMessagesBodyModel = v.omit(appendAgentRunMessagesInputModel, [
  "grant",
])
const resumeApprovedActionBodyModel = v.omit(resumeApprovedActionInputModel, [
  "actionId",
])

const memberSearchQueryModel = v.strictObject({
  query: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  limit: limitQueryModel,
})

const labelSearchQueryModel = v.strictObject({
  query: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(40))),
  limit: limitQueryModel,
})

const issueSearchQueryModel = v.strictObject({
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  status: v.optional(v.picklist(["open", "in_progress", "closed"])),
  priority: v.optional(
    v.picklist(["no_priority", "low", "medium", "high", "urgent"])
  ),
  assigneeId: v.optional(identifierModel),
  label: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))
  ),
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
  limit: limitQueryModel,
})

const issueIdParamsModel = v.strictObject({ issueId: identifierModel })
const issueAttachmentParamsModel = v.strictObject({
  issueId: identifierModel,
  fileId: identifierModel,
})
const issueNumberParamsModel = v.strictObject({
  number: positiveIntegerQueryModel,
})
const actionIdParamsModel = v.strictObject({ actionId: identifierModel })
const assetIdParamsModel = v.strictObject({ assetId: identifierModel })

const issueAttachmentQueryModel = v.strictObject({
  attachmentCursor: v.optional(
    v.pipe(v.string(), v.minLength(1), v.maxLength(1024))
  ),
  attachmentLimit: v.optional(
    v.pipe(positiveIntegerQueryModel, v.maxValue(FILE_LIST_MAX_LIMIT))
  ),
})

const prepareIssueActionBodyModel = v.variant("kind", [
  v.strictObject({
    kind: v.literal("create_issue"),
    toolCallId: prepareCreateIssueInputModel.entries.toolCallId,
    idempotencyKey: prepareCreateIssueInputModel.entries.idempotencyKey,
    issue: prepareCreateIssueInputModel.entries.issue,
  }),
  v.strictObject({
    kind: v.literal("update_issue"),
    toolCallId: prepareUpdateIssueInputModel.entries.toolCallId,
    idempotencyKey: prepareUpdateIssueInputModel.entries.idempotencyKey,
    issue: prepareUpdateIssueInputModel.entries.issue,
  }),
  v.strictObject({
    kind: v.literal("delete_issue"),
    toolCallId: prepareDeleteIssueInputModel.entries.toolCallId,
    idempotencyKey: prepareDeleteIssueInputModel.entries.idempotencyKey,
    issue: prepareDeleteIssueInputModel.entries.issue,
  }),
])

const parseInternalInput = <
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  input: unknown
): v.InferOutput<TSchema> => {
  const result = v.safeParse(schema, input)
  if (!result.success) {
    // Valibot issueには入力値が含まれ得る。HTTP境界へtokenを含むcauseを渡さない。
    throw publicErrors.validation("Invalid agent request")
  }
  return result.output
}

const bearerGrant = (request: Request): string => {
  const result = v.safeParse(agentInternalAuthorizationModel, {
    authorization: request.headers.get("authorization") ?? "",
  })
  if (!result.success) throw publicErrors.unauthorized()
  return result.output.authorization.slice("Bearer ".length)
}

/**
 * Repository境界のunit test用facade。Worker間transportの正本は
 * `createAgentInternalApp`をnamed WorkerEntrypointのfetchから呼ぶHTTP境界である。
 */
export const createAgentInternalApi = (db: Db) => ({
  consumeConnectionTicket(
    input: v.InferInput<typeof consumeConnectionTicketInputModel>
  ) {
    return consumeAgentConnectionTicket(
      db,
      parseInternalInput(consumeConnectionTicketInputModel, input)
    )
  },
  startRun(input: v.InferInput<typeof startAgentRunInputModel>) {
    return startAgentRun(db, parseInternalInput(startAgentRunInputModel, input))
  },
  reserveWebSearch(
    input: v.InferInput<typeof reserveAgentWebSearchInputModel>
  ) {
    return reserveAgentWebSearch(
      db,
      parseInternalInput(reserveAgentWebSearchInputModel, input)
    )
  },
  guardWebSearch(input: v.InferInput<typeof guardAgentWebSearchInputModel>) {
    return guardAgentWebSearchQuery(
      db,
      parseInternalInput(guardAgentWebSearchInputModel, input)
    )
  },
  cancelRun(input: v.InferInput<typeof agentGrantInputModel>) {
    return cancelAgentRun(db, parseInternalInput(agentGrantInputModel, input))
  },
  finishRun(input: v.InferInput<typeof finishAgentRunInputModel>) {
    return finishAgentRun(
      db,
      parseInternalInput(finishAgentRunInputModel, input)
    )
  },
  appendRunMessages(
    input: v.InferInput<typeof appendAgentRunMessagesInputModel>
  ) {
    return appendAgentRunMessages(
      db,
      parseInternalInput(appendAgentRunMessagesInputModel, input)
    )
  },
  renameThread(input: v.InferInput<typeof renameAgentThreadInputModel>) {
    return renameAgentThreadForRun(
      db,
      parseInternalInput(renameAgentThreadInputModel, input)
    )
  },
  recordUsage(input: v.InferInput<typeof recordAgentUsageInputModel>) {
    return recordAgentUsage(
      db,
      parseInternalInput(recordAgentUsageInputModel, input)
    )
  },
  readAccountContext(input: v.InferInput<typeof agentGrantInputModel>) {
    return readAgentAccountContext(
      db,
      parseInternalInput(agentGrantInputModel, input)
    )
  },
  readActiveOrganization(input: v.InferInput<typeof agentGrantInputModel>) {
    return readAgentActiveOrganization(
      db,
      parseInternalInput(agentGrantInputModel, input)
    )
  },
  searchOrganizationMembers(
    input: v.InferInput<typeof searchAgentMembersInputModel>
  ) {
    return searchAgentOrganizationMembers(
      db,
      parseInternalInput(searchAgentMembersInputModel, input)
    )
  },
  searchIssueLabels(input: v.InferInput<typeof searchAgentLabelsInputModel>) {
    return searchAgentIssueLabels(
      db,
      parseInternalInput(searchAgentLabelsInputModel, input)
    )
  },
  searchIssues(input: v.InferInput<typeof searchAgentIssuesInputModel>) {
    return searchAgentIssues(
      db,
      parseInternalInput(searchAgentIssuesInputModel, input)
    )
  },
  getIssue(input: v.InferInput<typeof getAgentIssueInputModel>) {
    return getAgentIssue(db, parseInternalInput(getAgentIssueInputModel, input))
  },
  getIssueAttachmentImageForModel(
    input: v.InferInput<typeof getAgentIssueAttachmentImageInputModel>
  ) {
    return getIssueAttachmentImageForModel(
      db,
      parseInternalInput(getAgentIssueAttachmentImageInputModel, input)
    )
  },
  prepareCreateIssue(input: v.InferInput<typeof prepareCreateIssueInputModel>) {
    return prepareCreateIssueAction(
      db,
      parseInternalInput(prepareCreateIssueInputModel, input)
    )
  },
  prepareUpdateIssue(input: v.InferInput<typeof prepareUpdateIssueInputModel>) {
    return prepareUpdateIssueAction(
      db,
      parseInternalInput(prepareUpdateIssueInputModel, input)
    )
  },
  prepareDeleteIssue(input: v.InferInput<typeof prepareDeleteIssueInputModel>) {
    return prepareDeleteIssueAction(
      db,
      parseInternalInput(prepareDeleteIssueInputModel, input)
    )
  },
  getIssueActionDecision(
    input: v.InferInput<typeof getIssueActionDecisionInputModel>
  ) {
    return getAgentIssueActionDecision(
      db,
      parseInternalInput(getIssueActionDecisionInputModel, input)
    )
  },
  resumeApprovedAction(
    input: v.InferInput<typeof resumeApprovedActionInputModel>
  ) {
    return resumeAgentApprovedAction(
      db,
      parseInternalInput(resumeApprovedActionInputModel, input)
    )
  },
  executeApprovedAction(
    input: v.InferInput<typeof executeApprovedActionInputModel>
  ) {
    return executeAgentApprovedAction(
      db,
      parseInternalInput(executeApprovedActionInputModel, input)
    )
  },
  getAgentImageForModel(input: v.InferInput<typeof getAgentImageInputModel>) {
    return getAgentImageForModel(
      db,
      parseInternalInput(getAgentImageInputModel, input)
    )
  },
})

/**
 * Agent Workerからnamed Service Bindingでだけ到達できるprivate Elysia app。
 * public `createApp`、CORS、OpenAPI、Better Auth/CSRFへはmountしない。
 */
export const createAgentInternalApp = (db: Db) => {
  const api = createAgentInternalApi(db)

  return new Elysia({ name: "agent-internal" })
    .use(requestIdPlugin)
    .use(observabilityPlugin)
    .use(errorPlugin)
    .onRequest(({ set }) => {
      set.headers["cache-control"] = "private, no-store"
    })
    .group("/internal/agent", (app) =>
      app
        .post(
          "/connections/consume",
          ({ body }) => api.consumeConnectionTicket(body),
          { body: consumeConnectionTicketInputModel }
        )
        .post(
          "/runs",
          ({ body, request }) =>
            api.startRun({ ...body, grant: bearerGrant(request) }),
          { body: startRunBodyModel }
        )
        .post(
          "/runs/web-search/reserve",
          ({ body, request }) =>
            api.reserveWebSearch({
              ...body,
              grant: bearerGrant(request),
            }),
          { body: reserveWebSearchBodyModel }
        )
        .post(
          "/runs/web-search/guard",
          ({ body, request }) =>
            api.guardWebSearch({ ...body, grant: bearerGrant(request) }),
          { body: guardWebSearchBodyModel }
        )
        .post(
          "/runs/cancel",
          ({ request }) => api.cancelRun({ grant: bearerGrant(request) }),
          { body: emptyBodyModel }
        )
        .post(
          "/runs/finish",
          ({ body, request }) =>
            api.finishRun({ ...body, grant: bearerGrant(request) }),
          { body: finishRunBodyModel }
        )
        .post(
          "/runs/messages",
          ({ body, request }) =>
            api.appendRunMessages({ ...body, grant: bearerGrant(request) }),
          { body: appendRunMessagesBodyModel }
        )
        .post(
          "/runs/thread-title",
          ({ body, request }) =>
            api.renameThread({ ...body, grant: bearerGrant(request) }),
          { body: renameThreadBodyModel }
        )
        .post(
          "/runs/usage",
          ({ body, request }) =>
            api.recordUsage({ ...body, grant: bearerGrant(request) }),
          { body: recordUsageBodyModel }
        )
        .get("/context/account", ({ request }) =>
          api.readAccountContext({ grant: bearerGrant(request) })
        )
        .get("/context/organization", ({ request }) =>
          api.readActiveOrganization({ grant: bearerGrant(request) })
        )
        .get(
          "/members",
          ({ query, request }) =>
            api.searchOrganizationMembers({
              grant: bearerGrant(request),
              limit: query.limit,
              query: query.query,
            }),
          { query: memberSearchQueryModel }
        )
        .get(
          "/issue-labels",
          ({ query, request }) =>
            api.searchIssueLabels({
              grant: bearerGrant(request),
              limit: query.limit,
              query: query.query,
            }),
          { query: labelSearchQueryModel }
        )
        .get(
          "/issues",
          ({ query, request }) =>
            api.searchIssues({ ...query, grant: bearerGrant(request) }),
          { query: issueSearchQueryModel }
        )
        .get(
          "/issues/by-number/:number",
          ({ params, query, request }) =>
            api.getIssue({
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
            api.getIssueAttachmentImageForModel({
              fileId: params.fileId,
              grant: bearerGrant(request),
              issueId: params.issueId,
            }),
          { params: issueAttachmentParamsModel }
        )
        .get(
          "/issues/:issueId",
          ({ params, query, request }) =>
            api.getIssue({
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
                return api.prepareCreateIssue({
                  grant,
                  idempotencyKey: body.idempotencyKey,
                  issue: body.issue,
                  toolCallId: body.toolCallId,
                })
              case "update_issue":
                return api.prepareUpdateIssue({
                  grant,
                  idempotencyKey: body.idempotencyKey,
                  issue: body.issue,
                  toolCallId: body.toolCallId,
                })
              case "delete_issue":
                return api.prepareDeleteIssue({
                  grant,
                  idempotencyKey: body.idempotencyKey,
                  issue: body.issue,
                  toolCallId: body.toolCallId,
                })
            }
          },
          { body: prepareIssueActionBodyModel }
        )
        .get(
          "/actions/:actionId",
          ({ params, request }) =>
            api.getIssueActionDecision({
              actionId: params.actionId,
              grant: bearerGrant(request),
            }),
          { params: actionIdParamsModel }
        )
        .post(
          "/actions/:actionId/resume",
          ({ body, params }) =>
            api.resumeApprovedAction({
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
            api.executeApprovedAction({
              actionId: params.actionId,
              grant: bearerGrant(request),
            }),
          { body: emptyBodyModel, params: actionIdParamsModel }
        )
        .get(
          "/assets/:assetId/model",
          ({ params, request }) =>
            api.getAgentImageForModel({
              assetId: params.assetId,
              grant: bearerGrant(request),
            }),
          { params: assetIdParamsModel }
        )
    )
}

export type AgentInternalApp = ReturnType<typeof createAgentInternalApp>
