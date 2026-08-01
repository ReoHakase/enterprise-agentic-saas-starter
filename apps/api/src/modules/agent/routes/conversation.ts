import { Elysia } from "elysia"

import { agentRunResultSchema } from "../../../agent-client"
import { HttpError } from "../../../errors/http-error"
import { errorResponseModel, tenantErrorResponses } from "../../../models/api"
import {
  createObservedLogger,
  withObservedSpan,
} from "../../../platform/observability/runtime"
import type { AccessControlFactory } from "../../authorization/public"
import { agentStreamResponseModel } from "../action-schema"
import {
  agentMessagePageModel,
  agentMessagePageQueryModel,
  agentChatBodyModel,
  agentThreadListModel,
  agentThreadModel,
  agentThreadParamsModel,
  agentRunParamsModel,
  createAgentThreadBodyModel,
} from "../model"
import type { AgentService } from "../service"

const logger = createObservedLogger("agent").child("chat")

const agentErrorResponses = {
  ...tenantErrorResponses,
  503: errorResponseModel,
} as const

export const createAgentConversationRoutes = (
  service: AgentService,
  createAccessControl: AccessControlFactory
) =>
  new Elysia({ name: "agent-conversation-routes" })
    .use(createAccessControl())
    .get(
      "/agent/threads",
      ({ authContext: { session, user } }) =>
        service.listAgentThreads({
          sessionId: session.id,
          userId: user.id,
        }),
      {
        authenticated: true,
        response: {
          200: agentThreadListModel,
          ...agentErrorResponses,
        },
        detail: {
          operationId: "listAgentThreads",
          summary: "List active Agent threads",
          description:
            "Lists active private Agent threads after revalidating the current session, active organization, membership, and thread owner. Archived and cross-tenant threads are excluded.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/agent/threads",
      async ({ authContext: { session, user }, body, status }) =>
        status(
          201,
          await service.createAgentThread({
            sessionId: session.id,
            userId: user.id,
            permissionMode: body.permissionMode,
          })
        ),
      {
        authenticated: true,
        body: createAgentThreadBodyModel,
        response: {
          201: agentThreadModel,
          ...agentErrorResponses,
        },
        detail: {
          operationId: "createAgentThread",
          summary: "Create a private Agent thread",
          description:
            "Creates a private Agent thread and its initial approval policy in one transaction, bound to the authenticated session owner and active organization.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/agent/threads/:threadId/archive",
      ({ authContext: { session, user }, params }) =>
        service.archiveAgentThread({
          sessionId: session.id,
          userId: user.id,
          threadId: params.threadId,
        }),
      {
        authenticated: true,
        params: agentThreadParamsModel,
        response: {
          200: agentThreadModel,
          ...agentErrorResponses,
        },
        detail: {
          operationId: "archiveAgentThread",
          summary: "Archive an Agent thread",
          description:
            "Archives a thread owned by the authenticated user and revokes its unused tickets, grants, and active runs in the same transaction so it cannot continue executing.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/agent/threads/:threadId/runs/:runId/cancel",
      ({ authContext: { session, user }, params }) =>
        service.cancelAgentRun({
          runId: params.runId,
          sessionId: session.id,
          threadId: params.threadId,
          userId: user.id,
        }),
      {
        authenticated: true,
        params: agentRunParamsModel,
        response: { 200: agentRunResultSchema, ...agentErrorResponses },
        detail: {
          operationId: "cancelAgentRun",
          summary: "Cancel an active Agent run",
          description:
            "Revalidates the live session, active membership, private thread owner, and run ownership before idempotently canceling an active run.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .post(
      "/agent/chat",
      async ({ authContext: { session, user }, body, request, set }) => {
        const requestKind =
          "contentSegments" in body
            ? "user-message"
            : "client-tool-continuation"
        logger.info("Agent chat request accepted", {
          "agent.chat.kind": requestKind,
          "agent.chat.asset_count":
            "assetIds" in body ? body.assetIds.length : 0,
          "agent.chat.content_segment_count":
            "contentSegments" in body ? body.contentSegments.length : 0,
          "agent.chat.client_tool_result_count":
            "clientToolResults" in body ? body.clientToolResults.length : 0,
        })
        const prepared = await withObservedSpan(
          {
            attributes: {
              "agent.chat.kind": requestKind,
            },
            name: "Prepare Agent chat",
            op: "agent.chat.prepare",
          },
          async () => {
            const timezone = service.normalizeAgentTimezone(body.timezone)
            return "contentSegments" in body
              ? await service.prepareAgentChat({
                  assetIds: body.assetIds,
                  contentSegments: body.contentSegments,
                  messageId: body.messageId,
                  sessionId: session.id,
                  userId: user.id,
                  threadId: body.threadId,
                  timezone,
                })
              : await service.prepareAgentClientToolContinuation({
                  assistantMessageId: body.assistantMessageId,
                  clientToolResults: body.clientToolResults,
                  sessionId: session.id,
                  userId: user.id,
                  threadId: body.threadId,
                  timezone,
                })
          }
        )
        const message = prepared.messages.at(-1)
        if (!message) {
          throw new HttpError({
            code: "service_unavailable",
            cause: new Error("Prepared Agent message is unavailable"),
            retryAfter: 30,
          })
        }
        logger.debug("Agent chat request prepared", {
          "agent.chat.asset_count": prepared.assetIds.length,
          "agent.chat.context_reference_count":
            prepared.contextReferences.length,
          "agent.chat.reusable_asset_count": prepared.reusableAssets.length,
          "agent.chat.trigger": prepared.trigger,
        })
        return service.forwardAgentChat(
          {
            assetIds: prepared.assetIds,
            contextReferences: prepared.contextReferences,
            clientMessageId: prepared.clientMessageId,
            message,
            reusableAssets: prepared.reusableAssets,
            threadId: prepared.threadId,
            ticket: prepared.ticket,
            timezone: prepared.timezone,
            trigger: prepared.trigger,
          },
          request.signal,
          typeof set.headers["x-request-id"] === "string"
            ? set.headers["x-request-id"]
            : undefined
        )
      },
      {
        authenticated: true,
        body: agentChatBodyModel,
        response: {
          200: agentStreamResponseModel,
          400: errorResponseModel,
          401: tenantErrorResponses[401],
          403: tenantErrorResponses[403],
          404: tenantErrorResponses[404],
          409: errorResponseModel,
          429: errorResponseModel,
          500: tenantErrorResponses[500],
          503: errorResponseModel,
        },
        detail: {
          operationId: "streamAgentChat",
          summary: "Stream a private Agent response",
          description:
            "Persists only the final user message or allowlisted client-tool results, then forwards a one-time ticket and bounded server-owned history to the private Agent Worker. Browser history and caller-supplied user or organization identifiers are rejected.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
    .get(
      "/agent/threads/:threadId/messages",
      ({ authContext: { session, user }, params, query, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return service.listAgentMessages({
          sessionId: session.id,
          threadId: params.threadId,
          userId: user.id,
          page: query.page,
          perPage: query.perPage,
        })
      },
      {
        authenticated: true,
        params: agentThreadParamsModel,
        query: agentMessagePageQueryModel,
        response: {
          200: agentMessagePageModel,
          ...agentErrorResponses,
        },
        detail: {
          operationId: "listAgentThreadMessages",
          summary: "List Agent Memory messages",
          description:
            "Returns only the bounded UI projection persisted by the API after revalidating the live session, active organization, membership, and private thread owner.",
          tags: ["Agent"],
          "x-route-status": "enabled",
          "x-auth-context": "session-cookie",
          "x-audience": "first-party-web",
        },
      }
    )
