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
  agentThreadListModel,
  agentThreadModel,
  agentThreadParamsModel,
  createAgentThreadBodyModel,
  decideAgentActionBodyModel,
  deleteAgentApprovalPolicyQueryModel,
  getAgentApprovalPolicyQueryModel,
  putAgentApprovalPolicyBodyModel,
  resumeAgentActionBodyModel,
} from "./model"
import {
  archiveAgentThread,
  createAgentThread,
  decideAgentAction,
  deleteAgentApprovalPolicy,
  getAgentAction,
  getAgentApprovalPolicy,
  forwardAgentChat,
  listAgentMessages,
  listAgentThreads,
  putAgentApprovalPolicy,
  normalizeAgentTimezone,
  prepareAgentClientToolContinuation,
  prepareAgentChat,
  revokeAgentContext,
  resumeAgentAction,
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
    .post(
      "/agent/chat",
      async ({ authContext: { session, user }, body, request }) => {
        const timezone = normalizeAgentTimezone(body.timezone)
        const prepared =
          "message" in body
            ? await prepareAgentChat(db, {
                assetIds: body.assetIds,
                message: body.message,
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
            "現在のsession、active organization、context epoch、thread ownerを再検証し、保存済みpayloadではなくAPI生成previewだけを返す。",
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
      "/agent/approval-policy",
      async ({ authContext: { session, user }, query, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return getAgentApprovalPolicy(db, {
          sessionId: session.id,
          userId: user.id,
          threadId: query.threadId,
        })
      },
      {
        authenticated: true,
        query: getAgentApprovalPolicyQueryModel,
        response: { 200: agentApprovalPolicyModel, ...tenantErrorResponses },
        detail: {
          operationId: "getAgentApprovalPolicy",
          summary: "現在のAgent自動許可policyを取得",
          description:
            "server保存のsession、organization、thread、context epoch、期限へ束縛されたpolicyだけを返す。",
          tags: ["Agent"],
        },
      }
    )
    .put(
      "/agent/approval-policy",
      async ({ authContext: { session, user }, body, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return putAgentApprovalPolicy(db, {
          sessionId: session.id,
          userId: user.id,
          threadId: body.threadId,
          mode: body.mode,
          expiresInSeconds: body.expiresInSeconds,
          destructiveConfirmation: body.destructiveConfirmation,
        })
      },
      {
        authenticated: true,
        body: putAgentApprovalPolicyBodyModel,
        response: { 200: agentApprovalPolicyModel, ...tenantErrorResponses },
        detail: {
          operationId: "putAgentApprovalPolicy",
          summary: "時限付きAgent自動許可policyを設定",
          description:
            "最大15分のask_each、auto_write、auto_allを設定する。auto_allはIssue deleteを明示する追加確認を必須にする。",
          tags: ["Agent"],
        },
      }
    )
    .delete(
      "/agent/approval-policy",
      async ({ authContext: { session, user }, query, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return deleteAgentApprovalPolicy(db, {
          sessionId: session.id,
          userId: user.id,
          threadId: query.threadId,
        })
      },
      {
        authenticated: true,
        query: deleteAgentApprovalPolicyQueryModel,
        response: { 200: agentApprovalPolicyModel, ...tenantErrorResponses },
        detail: {
          operationId: "deleteAgentApprovalPolicy",
          summary: "現在のAgent自動許可policyを解除",
          description:
            "live session、active organization、membership、thread owner、context epochを再検証し、現在scopeのpolicyを解除してask_eachへ戻す。",
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
