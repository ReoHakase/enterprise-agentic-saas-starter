import type { Db } from "@enterprise-agentic-saas/db"
import type { AgentApprovalPolicyMode } from "@enterprise-agentic-saas/db/schema"

import {
  decideAgentActionForSession,
  getAgentActionForSession,
  getAgentApprovalPolicyForSession,
  issueAgentActionResumeTicket,
  putAgentApprovalPolicyForSession,
} from "./action-repository"
import {
  archiveAgentThreadForSession,
  createAgentThreadForSession,
  issueAgentConnectionTicket,
  listAgentThreadsForSession,
  revokeCurrentAgentContext,
} from "./repository"

const DEFAULT_THREAD_TITLE = "New conversation"

export const listAgentThreads = (
  db: Db,
  input: { sessionId: string; userId: string }
) => listAgentThreadsForSession(db, input)

export const createAgentThread = (
  db: Db,
  input: { sessionId: string; userId: string; title?: string }
) =>
  createAgentThreadForSession(db, {
    ...input,
    title: input.title?.trim() || DEFAULT_THREAD_TITLE,
  })

export const archiveAgentThread = (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string }
) => archiveAgentThreadForSession(db, input)

export const createAgentConnection = (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string }
) => issueAgentConnectionTicket(db, input)

export const revokeAgentContext = (
  db: Db,
  input: { sessionId: string; userId: string }
) => revokeCurrentAgentContext(db, input)

export const getAgentAction = (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string }
) => getAgentActionForSession(db, input)

export const decideAgentAction = (
  db: Db,
  input: {
    actionId: string
    decision: "yes" | "no"
    idempotencyKey: string
    sessionId: string
    userId: string
  }
) => decideAgentActionForSession(db, input)

export const createAgentActionResumeTicket = (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string }
) => issueAgentActionResumeTicket(db, input)

export const getAgentApprovalPolicy = (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string }
) => getAgentApprovalPolicyForSession(db, input)

export const putAgentApprovalPolicy = (
  db: Db,
  input: {
    sessionId: string
    userId: string
    threadId: string
    mode: AgentApprovalPolicyMode
    expiresInSeconds: number
    destructiveConfirmation?: "ALLOW_ISSUE_DELETE"
  }
) => putAgentApprovalPolicyForSession(db, input)
