import type { Db } from "@enterprise-agentic-saas/db"
import { Elysia } from "elysia"

import {
  authenticatedErrorResponses,
  tenantErrorResponses,
} from "../../models/api"
import { createAccessControlModule } from "../authorization/access-control"
import {
  agentConnectionTicketModel,
  agentActionParamsModel,
  agentApprovalPolicyModel,
  agentContextRevocationModel,
  agentIssueActionModel,
  agentThreadListModel,
  agentThreadModel,
  agentThreadParamsModel,
  createAgentConnectionBodyModel,
  createAgentThreadBodyModel,
  decideAgentActionBodyModel,
  getAgentApprovalPolicyQueryModel,
  issueAgentResumeTicketModel,
  putAgentApprovalPolicyBodyModel,
} from "./model"
import {
  archiveAgentThread,
  createAgentActionResumeTicket,
  createAgentConnection,
  createAgentThread,
  decideAgentAction,
  getAgentAction,
  getAgentApprovalPolicy,
  listAgentThreads,
  putAgentApprovalPolicy,
  revokeAgentContext,
} from "./service"

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
      "/agent/connections",
      async ({ authContext: { session, user }, body, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return createAgentConnection(db, {
          sessionId: session.id,
          userId: user.id,
          threadId: body.threadId,
        })
      },
      {
        authenticated: true,
        body: createAgentConnectionBodyModel,
        response: {
          200: agentConnectionTicketModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "createAgentConnectionTicket",
          summary: "一回限りのAgent接続ticketを発行",
          description:
            "60秒以下のopaque ticketをsession、user、active organization、thread、context epochへ束縛し、DBにはhashだけを保存する。",
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
      "/agent/actions/:actionId/resume-ticket",
      async ({ authContext: { session, user }, params, set }) => {
        set.headers["cache-control"] = "private, no-store"
        return createAgentActionResumeTicket(db, {
          actionId: params.actionId,
          sessionId: session.id,
          userId: user.id,
        })
      },
      {
        authenticated: true,
        params: agentActionParamsModel,
        response: {
          200: issueAgentResumeTicketModel,
          ...tenantErrorResponses,
        },
        detail: {
          operationId: "createAgentActionResumeTicket",
          summary: "承認済みactionの一回限りresume ticketを発行",
          description:
            "60秒以下のopaque ticketをactionとcurrent session scopeへ束縛し、DBにはhashだけを保存する。",
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
