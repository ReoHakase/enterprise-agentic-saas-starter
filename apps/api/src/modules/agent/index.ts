import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"
import * as v from "valibot"

import {
  authenticatedErrorResponses,
  tenantErrorResponses,
} from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import {
  agentActionParamsModel,
  agentActionExecutionResultModel,
  agentApprovalPolicyModel,
  agentCanonicalMessageListModel,
  agentChatBodyModel,
  agentContextRevocationModel,
  agentIssueActionModel,
  agentMonthlyUsageModel,
  agentOrganizationUsageModel,
  agentThreadListModel,
  agentThreadContextModel,
  agentThreadModel,
  agentThreadParamsModel,
  agentUsageQueryModel,
  createAgentThreadBodyModel,
  decideAgentActionBodyModel,
  putAgentApprovalPolicyBodyModel,
  resumeAgentActionBodyModel,
  updateAgentThreadTitleBodyModel,
} from "./model"
import {
  archiveAgentThread,
  createAgentThread,
  decideAgentAction,
  getAgentAction,
  getAgentApprovalPolicy,
  getAgentMonthlyUsage,
  getAgentOrganizationUsage,
  getAgentThreadContext,
  forwardAgentChat,
  listAgentMessages,
  listAgentThreads,
  putAgentApprovalPolicy,
  normalizeAgentTimezone,
  prepareAgentClientToolContinuation,
  prepareAgentChat,
  revokeAgentContext,
  resumeAgentAction,
  updateAgentThreadTitle,
} from "./service"

const agentStreamResponseModel = v.any()

export const createAgentModule = (db: Db) =>
  new Elysia({ name: "agent" })
    .use(createAccessControlModule(db))
    .get(
      "/agent/threads",
      ({ authContext: { session, user } }) =>
        listAgentThreads(db, {
          sessionId: session.id,
          userId: user.id,
        }),
      {
        authenticated: true,
        response: {
          200: agentThreadListModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "listAgentThreads",
          summary: "active organizationのAgent thread一覧を取得",
          description:
            "現在のsession、active organization、membership、ownerを再検証し、activeなprivate threadだけを返す。",
          tags: ["Agent"],
        },
      }
    )
    .post(
      "/agent/threads",
      async ({ authContext: { session, user }, body, status }) =>
        status(
          201,
          await createAgentThread(db, {
            sessionId: session.id,
            userId: user.id,
            title: body.title,
          })
        ),
      {
        authenticated: true,
        body: createAgentThreadBodyModel,
        response: {
          201: agentThreadModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "createAgentThread",
          summary: "Agent threadを作成",
          description:
            "現在のsessionとactive organizationへ束縛したprivate threadを作成する。",
          tags: ["Agent"],
        },
      }
    )
    .post(
      "/agent/threads/:threadId/archive",
      ({ authContext: { session, user }, params }) =>
        archiveAgentThread(db, {
          sessionId: session.id,
          userId: user.id,
          threadId: params.threadId,
        }),
      {
        authenticated: true,
        params: agentThreadParamsModel,
        response: {
          200: agentThreadModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "archiveAgentThread",
          summary: "Agent threadをarchive",
          description:
            "ownerのthreadを一覧から隠し、紐づくticket、grant、active runを同じtransactionで失効する。",
          tags: ["Agent"],
        },
      }
    )
    .patch(
      "/agent/threads/:threadId/title",
      ({ authContext: { session, user }, body, params }) =>
        updateAgentThreadTitle(db, {
          expectedRevision: body.expectedRevision,
          sessionId: session.id,
          threadId: params.threadId,
          title: body.title,
          userId: user.id,
        }),
      {
        authenticated: true,
        params: agentThreadParamsModel,
        body: updateAgentThreadTitleBodyModel,
        response: { 200: agentThreadModel, ...tenantErrorResponses },
        detail: {
          operationId: "updateAgentThreadTitle",
          summary: "Agent thread名を変更",
          description:
            "ownerとtenantを再検証し、revision CASでuser titleへ更新する。自動titleはuser titleを上書きしない。",
          tags: ["Agent"],
        },
      }
    )
    .post(
      "/agent/chat",
      async ({ authContext: { session, user }, body, request }) => {
        const timezone = normalizeAgentTimezone(body.timezone)
        const prepared =
          "contentSegments" in body
            ? await prepareAgentChat(db, {
                assetIds: body.assetIds,
                contentSegments: body.contentSegments,
                messageId: body.messageId,
                sessionId: session.id,
                userId: user.id,
                threadId: body.threadId,
                timezone,
              })
            : await prepareAgentClientToolContinuation(db, {
                assistantMessageId: body.assistantMessageId,
                clientToolResults: body.clientToolResults,
                sessionId: session.id,
                userId: user.id,
                threadId: body.threadId,
                timezone,
              })
        return forwardAgentChat(
          {
            assetIds: prepared.assetIds,
            contextReferences: prepared.contextReferences,
            clientMessageId: prepared.clientMessageId,
            messages: prepared.messages,
            threadId: prepared.threadId,
            ticket: prepared.ticket,
            timezone: prepared.timezone,
            trigger: prepared.trigger,
          },
          request.signal
        )
      },
      {
        authenticated: true,
        body: agentChatBodyModel,
        response: {
          200: agentStreamResponseModel,
          400: agentStreamResponseModel,
          401: tenantErrorResponses[401],
          403: tenantErrorResponses[403],
          404: tenantErrorResponses[404],
          409: tenantErrorResponses[409],
          500: tenantErrorResponses[500],
          503: agentStreamResponseModel,
        },
        detail: {
          operationId: "streamAgentChat",
          summary: "private Agent WorkerからAI SDK UI streamを転送",
          description:
            "最後のuser messageまたは直前assistantのallowlist済みclient tool結果だけをcanonical履歴へ反映し、一回限りのticketとbounded server historyをprivate Service Bindingへ渡す。browser履歴、user ID、organization IDは受理しない。",
          tags: ["Agent"],
        },
      }
    )
    .get(
      "/agent/threads/:threadId/messages",
      ({ authContext: { session, user }, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return listAgentMessages(db, {
          sessionId: session.id,
          threadId: params.threadId,
          userId: user.id,
        })
      },
      {
        authenticated: true,
        params: agentThreadParamsModel,
        response: {
          200: agentCanonicalMessageListModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "listAgentThreadMessages",
          summary: "Agent threadのcanonical message履歴を取得",
          description:
            "live session、active organization、membership、thread ownerを再検証し、APIが保存したbounded UI projectionだけを返す。",
          tags: ["Agent"],
        },
      }
    )
    .get(
      "/agent/threads/:threadId/context",
      ({ authContext: { session, user }, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return getAgentThreadContext(db, {
          sessionId: session.id,
          threadId: params.threadId,
          userId: user.id,
        })
      },
      {
        authenticated: true,
        params: agentThreadParamsModel,
        response: { 200: agentThreadContextModel, ...tenantErrorResponses },
        detail: {
          operationId: "getAgentThreadContext",
          summary: "Agent threadのcontext使用量を取得",
          description:
            "owner境界を再検証し、保存messageの事前推定と最新compaction summaryを返す。provider実績とは区別する。",
          tags: ["Agent"],
        },
      }
    )
    .get(
      "/agent/usage/monthly",
      ({ authContext: { session, user }, query, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return getAgentMonthlyUsage(db, {
          sessionId: session.id,
          userId: user.id,
          month: query.month,
        })
      },
      {
        authenticated: true,
        query: agentUsageQueryModel,
        response: { 200: agentMonthlyUsageModel, ...tenantErrorResponses },
        detail: {
          operationId: "getMyAgentMonthlyUsage",
          summary: "本人の月間Agent usageを取得",
          description:
            "active organization内で本人に帰属する日次projectionを集計し、token内訳、model別内訳、算定costを返す。",
          tags: ["Agent"],
        },
      }
    )
    .get(
      "/agent/usage/organization",
      ({ authContext: { session, user }, query, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return getAgentOrganizationUsage(db, {
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
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "getOrganizationAgentUsage",
          summary: "管理者向けorganization/user/model別Agent usageを取得",
          description:
            "organization adminまたはownerへ、日次projectionから集計したuser別・model別usageと算定costを返す。",
          tags: ["Agent"],
        },
      }
    )
    .get(
      "/agent/actions/:actionId",
      async ({ authContext: { session, user }, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return getAgentAction(db, {
          actionId: params.actionId,
          sessionId: session.id,
          userId: user.id,
        })
      },
      {
        authenticated: true,
        params: agentActionParamsModel,
        response: { 200: agentIssueActionModel, ...tenantErrorResponses },
        detail: {
          operationId: "getAgentIssueAction",
          summary: "Agent Issue actionのcanonical previewを取得",
          description:
            "現在のmembership、active organization、thread ownerを再検証し、過去sessionやcontext epochには依存せずAPI生成previewだけを返す。decisionとresumeは元scopeへ厳格に拘束する。",
          tags: ["Agent"],
        },
      }
    )
    .post(
      "/agent/actions/:actionId/decision",
      async ({ authContext: { session, user }, body, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return decideAgentAction(db, {
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
        response: { 200: agentIssueActionModel, ...tenantErrorResponses },
        detail: {
          operationId: "decideAgentIssueAction",
          summary: "Agent Issue actionをYes/Noで決定",
          description:
            "canonical actionへ冪等なmanual decisionを保存する。Yes/No UIやAgent protocol response自体を実行権限にはしない。",
          tags: ["Agent"],
        },
      }
    )
    .post(
      "/agent/actions/:actionId/resume",
      async ({ authContext: { session, user }, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return resumeAgentAction(db, {
          actionId: params.actionId,
          sessionId: session.id,
          userId: user.id,
        })
      },
      {
        authenticated: true,
        params: agentActionParamsModel,
        body: resumeAgentActionBodyModel,
        response: {
          200: agentActionExecutionResultModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "resumeAgentIssueAction",
          summary: "承認済みactionをprivate Agent Runtimeで再開",
          description:
            "一回限りのresume ticketを内部発行し、browserへ公開せずprivate Agent Runtimeでconsumeしてtransaction実行まで完了する。",
          tags: ["Agent"],
        },
      }
    )
    .get(
      "/agent/threads/:threadId/permission",
      async ({ authContext: { session, user }, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return getAgentApprovalPolicy(db, {
          sessionId: session.id,
          userId: user.id,
          threadId: params.threadId,
        })
      },
      {
        authenticated: true,
        params: agentThreadParamsModel,
        response: { 200: agentApprovalPolicyModel, ...tenantErrorResponses },
        detail: {
          operationId: "getAgentThreadPermission",
          summary: "現在のAgent thread権限を取得",
          description:
            "server保存のsession、organization、thread、context epochへ束縛された権限だけを返す。",
          tags: ["Agent"],
        },
      }
    )
    .put(
      "/agent/threads/:threadId/permission",
      async ({ authContext: { session, user }, body, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return putAgentApprovalPolicy(db, {
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
        response: { 200: agentApprovalPolicyModel, ...tenantErrorResponses },
        detail: {
          operationId: "putAgentThreadPermission",
          summary: "Agent thread権限を設定",
          description:
            "現在のsession、organization、thread、context epochへ束縛したask_alwaysまたはfull_accessを設定する。",
          tags: ["Agent"],
        },
      }
    )
    .post(
      "/agent/context/revoke",
      ({ authContext: { session, user } }) =>
        revokeAgentContext(db, {
          sessionId: session.id,
          userId: user.id,
        }),
      {
        authenticated: true,
        response: {
          200: agentContextRevocationModel,
          ...authenticatedErrorResponses,
        },
        detail: {
          operationId: "revokeAgentContext",
          summary: "現在のAgent contextを失効",
          description:
            "現在sessionのepochを進め、未使用ticket、grant、active runを同じtransactionで失効する。",
          tags: ["Agent"],
        },
      }
    )
