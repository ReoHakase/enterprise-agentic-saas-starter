import { Elysia } from "elysia"

import {
  authenticatedErrorResponses,
  errorResponseModel,
  tenantErrorResponses,
} from "../../models/api"
import type { AccessControlFactory } from "../authorization/public"
import {
  agentActionExecutionResultModel,
  agentActionParamsModel,
  agentApprovalPolicyModel,
  agentIssueActionModel,
  decideAgentActionBodyModel,
  putAgentApprovalPolicyBodyModel,
  resumeAgentActionBodyModel,
} from "./action-schema"
import {
  agentMonthlyUsageModel,
  agentOrganizationUsageModel,
  agentThreadParamsModel,
  agentUsageQueryModel,
} from "./model"
import { createAgentConversationRoutes } from "./routes/conversation"
import { agentContextRevocationModel } from "./runtime-schema"
import type { AgentService } from "./service"

const agentErrorResponses = {
  ...tenantErrorResponses,
  503: errorResponseModel,
} as const

const agentAuthenticatedErrorResponses = {
  ...authenticatedErrorResponses,
  503: errorResponseModel,
} as const

export const createAgentRoutes = (
  service: AgentService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "agent" })
    .use(createAgentConversationRoutes(service, createAccessControl))
    .get(
      "/agent/usage/monthly",
      ({ authContext: { session, user }, query, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return service.getAgentMonthlyUsage({
          sessionId: session.id,
          userId: user.id,
          month: query.month,
        })
      },
      {
        authenticated: true,
        query: agentUsageQueryModel,
        response: { 200: agentMonthlyUsageModel, ...agentErrorResponses },
        detail: {
          operationId: "getMyAgentMonthlyUsage",
          summary: "Retrieve personal monthly Agent usage",
          description:
            "Aggregates daily usage attributed to the authenticated user in the active organization, including token categories, model breakdowns, and calculated cost for the selected month.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/agent/usage/organization",
      ({ authContext: { session, user }, query, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return service.getAgentOrganizationUsage({
          sessionId: session.id,
          userId: user.id,
          month: query.month,
        })
      },
      {
        authenticated: true,
        query: agentUsageQueryModel,
        response: {
          200: agentOrganizationUsageModel,
          ...agentErrorResponses,
        },
        detail: {
          operationId: "getOrganizationAgentUsage",
          summary: "Retrieve organization Agent usage",
          description:
            "Returns monthly Agent usage and calculated cost grouped by user and model from daily projections. Only an owner or administrator of the active organization may read it.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/agent/actions/:actionId",
      async ({ authContext: { session, user }, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return service.getAgentAction({
          actionId: params.actionId,
          sessionId: session.id,
          userId: user.id,
        })
      },
      {
        authenticated: true,
        params: agentActionParamsModel,
        response: { 200: agentIssueActionModel, ...agentErrorResponses },
        detail: {
          operationId: "getAgentIssueAction",
          summary: "Retrieve an Agent Issue action preview",
          description:
            "Returns the API-generated canonical preview after revalidating current membership, active organization, and thread ownership. Decision and resume capabilities remain bound to the original action scope.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/agent/actions/:actionId/decision",
      async ({ authContext: { session, user }, body, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return service.decideAgentAction({
          actionId: params.actionId,
          decision: body.decision,
          idempotencyKey: body.idempotencyKey,
          sessionId: session.id,
          userId: user.id,
        })
      },
      {
        authenticated: true,
        params: agentActionParamsModel,
        body: decideAgentActionBodyModel,
        response: { 200: agentIssueActionModel, ...agentErrorResponses },
        detail: {
          operationId: "decideAgentIssueAction",
          summary: "Decide an Agent Issue action",
          description:
            "Persists an idempotent manual approval or rejection on the canonical action. A UI choice or Agent protocol response alone never grants authority to execute the write.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/agent/actions/:actionId/resume",
      async ({ authContext: { session, user }, params, request, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return service.resumeAgentAction(
          {
            actionId: params.actionId,
            sessionId: session.id,
            userId: user.id,
          },
          request.signal
        )
      },
      {
        authenticated: true,
        params: agentActionParamsModel,
        body: resumeAgentActionBodyModel,
        response: {
          200: agentActionExecutionResultModel,
          ...agentErrorResponses,
        },
        detail: {
          operationId: "resumeAgentIssueAction",
          summary: "Resume an approved Agent Issue action",
          description:
            "Issues a one-time internal resume ticket and consumes it through the private Agent Runtime to complete the authorized transaction. The capability is never returned to the browser.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/agent/threads/:threadId/permission",
      async ({ authContext: { session, user }, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return service.getAgentApprovalPolicy({
          sessionId: session.id,
          userId: user.id,
          threadId: params.threadId,
        })
      },
      {
        authenticated: true,
        params: agentThreadParamsModel,
        response: { 200: agentApprovalPolicyModel, ...agentErrorResponses },
        detail: {
          operationId: "getAgentThreadPermission",
          summary: "Retrieve an Agent thread permission",
          description:
            "Returns the server-stored approval policy bound to the current session, organization, thread, and context epoch after revalidating private thread ownership.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .put(
      "/agent/threads/:threadId/permission",
      async ({ authContext: { session, user }, body, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return service.putAgentApprovalPolicy({
          sessionId: session.id,
          userId: user.id,
          threadId: params.threadId,
          mode: body.mode,
        })
      },
      {
        authenticated: true,
        params: agentThreadParamsModel,
        body: putAgentApprovalPolicyBodyModel,
        response: { 200: agentApprovalPolicyModel, ...agentErrorResponses },
        detail: {
          operationId: "putAgentThreadPermission",
          summary: "Set an Agent thread permission",
          description:
            "Sets ask-always or full-access mode for the private thread, bound to the current session, active organization, owner, and context epoch. Context revocation invalidates the grant.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/agent/context/revoke",
      ({ authContext: { session, user } }) =>
        service.revokeAgentContext({
          sessionId: session.id,
          userId: user.id,
        }),
      {
        authenticated: true,
        response: {
          200: agentContextRevocationModel,
          ...agentAuthenticatedErrorResponses,
        },
        detail: {
          operationId: "revokeAgentContext",
          summary: "Revoke the current Agent context",
          description:
            "Advances the authenticated session's Agent context epoch and revokes unused tickets, grants, and active runs in the same transaction, preventing later reuse.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
