import type { Db } from "@enterprise-agentic-saas/db"
import {
  AGENT_RESUME_TICKET_MAX_LIFETIME_MS,
  agentActions,
  agentResumeTickets,
  agentRuns,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, isNull } from "drizzle-orm"

import type {
  AgentActionExecutionResult,
  AgentIssueAction,
  AgentResumeTicket,
} from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import { ensureAgentSessionContextInTransaction } from "../context/repository"
import { createAgentToken, hashAgentToken } from "../crypto"
import {
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
  validateGrantInTransaction,
  type AgentTransaction,
  type ValidGrant,
} from "../threads/repository"
import {
  AgentActionWriteRaceError,
  executionResult,
  isActionWriteRetryableRace,
  preserveAgentActionError,
  toActionDto,
  withAgentActionLock,
} from "./repository-support"

export const requireActionForGrant = async (
  tx: AgentTransaction,
  context: ValidGrant,
  actionId: string
) => {
  const rows = await tx
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.id, actionId),
        eq(agentActions.organizationId, context.organizationId),
        eq(agentActions.threadId, context.threadId),
        eq(agentActions.sessionId, context.sessionId),
        eq(agentActions.userId, context.userId),
        eq(agentActions.contextEpoch, context.contextEpoch)
      )
    )
    .limit(1)
  const action = rows[0]
  if (!action) {
    throw publicErrors.notFound("Agent action not found", {
      resource: "agent_action",
    })
  }
  return action
}

export const getAgentIssueActionDecision = async (
  db: Db,
  input: { grant: string; actionId: string; now?: Date }
): Promise<AgentIssueAction> => {
  try {
    const action = await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const context = await validateGrantInTransaction(tx, {
        tokenHash: await hashAgentToken(input.grant),
        kind: "run",
        now,
      })
      return requireActionForGrant(tx, context, input.actionId)
    })
    return toActionDto(action)
  } catch (cause) {
    return preserveAgentActionError(cause, "getAgentIssueActionDecision")
  }
}

const requirePublicAction = async (
  tx: AgentTransaction,
  input: { actionId: string; sessionId: string; userId: string; now: Date }
) => {
  const live = await requireLiveSession(tx, input)
  await requireActiveMembership(tx, live)
  const context = await ensureAgentSessionContextInTransaction(tx, input)
  const rows = await tx
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.id, input.actionId),
        eq(agentActions.organizationId, live.activeOrganizationId),
        eq(agentActions.sessionId, input.sessionId),
        eq(agentActions.userId, input.userId),
        eq(agentActions.contextEpoch, context.contextEpoch)
      )
    )
    .limit(1)
  const action = rows[0]
  if (!action) {
    throw publicErrors.notFound("Agent action not found", {
      resource: "agent_action",
    })
  }
  await requireOwnedThread(tx, {
    threadId: action.threadId,
    userId: input.userId,
    activeOrganizationId: live.activeOrganizationId,
  })
  return action
}

const requireHistoricalPublicAction = async (
  tx: AgentTransaction,
  input: { actionId: string; sessionId: string; userId: string; now: Date }
) => {
  const live = await requireLiveSession(tx, input)
  await requireActiveMembership(tx, live)
  const rows = await tx
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.id, input.actionId),
        eq(agentActions.organizationId, live.activeOrganizationId),
        eq(agentActions.userId, input.userId)
      )
    )
    .limit(1)
  const action = rows[0]
  if (!action) {
    throw publicErrors.notFound("Agent action not found", {
      resource: "agent_action",
    })
  }
  await requireOwnedThread(tx, {
    threadId: action.threadId,
    userId: input.userId,
    activeOrganizationId: live.activeOrganizationId,
    requireActive: false,
  })
  return action
}

export const getAgentActionForSession = async (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string; now?: Date }
): Promise<AgentIssueAction> => {
  try {
    const action = await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const current = await requireHistoricalPublicAction(tx, { ...input, now })
      if (
        (current.status === "pending" || current.status === "approved") &&
        current.expiresAt.getTime() <= now.getTime()
      ) {
        const rows = await tx
          .update(agentActions)
          .set({ status: "expired", completedAt: now, updatedAt: now })
          .where(
            and(
              eq(agentActions.organizationId, current.organizationId),
              eq(agentActions.id, current.id),
              inArray(agentActions.status, ["pending", "approved"])
            )
          )
          .returning()
        return rows[0] ?? current
      }
      return current
    })
    return toActionDto(action)
  } catch (cause) {
    return preserveAgentActionError(cause, "getAgentActionForSession")
  }
}

export type DecideAgentActionInput = {
  actionId: string
  decision: "yes" | "no"
  idempotencyKey: string
  sessionId: string
  userId: string
  now?: Date
}

const decideAgentActionForSessionWithRetry = async (
  db: Db,
  input: DecideAgentActionInput,
  attempt = 0
): Promise<AgentIssueAction> => {
  try {
    const outcome = await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const action = await requirePublicAction(tx, { ...input, now })
      const desiredStatus = input.decision === "yes" ? "approved" : "rejected"
      const decisionKeyRows = await tx
        .select({ id: agentActions.id })
        .from(agentActions)
        .where(
          and(
            eq(agentActions.organizationId, action.organizationId),
            eq(agentActions.decisionIdempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1)
      if (decisionKeyRows[0] && decisionKeyRows[0].id !== action.id) {
        throw publicErrors.conflict(
          "Agent decision idempotency key is already in use",
          {
            reason: "idempotency_conflict",
            resource: "agent_action",
          }
        )
      }
      const repeatedDecision =
        action.decisionProvenance === "manual" &&
        action.decisionIdempotencyKey === input.idempotencyKey &&
        (input.decision === "yes"
          ? action.status !== "rejected"
          : action.status === "rejected")
      if (repeatedDecision) {
        return { action, expired: false }
      }
      if (action.status !== "pending" || action.decisionProvenance !== null) {
        throw publicErrors.conflict("Agent action was already decided", {
          reason: "decision_conflict",
          resource: "agent_action",
        })
      }
      if (action.expiresAt.getTime() <= now.getTime()) {
        const rows = await tx
          .update(agentActions)
          .set({ status: "expired", completedAt: now, updatedAt: now })
          .where(
            and(
              eq(agentActions.organizationId, action.organizationId),
              eq(agentActions.id, action.id),
              eq(agentActions.status, "pending")
            )
          )
          .returning()
        return { action: rows[0] ?? action, expired: true }
      }
      const rows = await tx
        .update(agentActions)
        .set({
          status: desiredStatus,
          decisionProvenance: "manual",
          decisionIdempotencyKey: input.idempotencyKey,
          decidedAt: now,
          completedAt: input.decision === "no" ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentActions.organizationId, action.organizationId),
            eq(agentActions.id, action.id),
            eq(agentActions.status, "pending"),
            isNull(agentActions.decisionProvenance)
          )
        )
        .returning()
      const decided = rows[0]
      if (!decided) {
        throw new AgentActionWriteRaceError(
          "Agent decision changed concurrently"
        )
      }
      if (input.decision === "no") {
        await tx
          .update(agentRuns)
          .set({ status: "canceled", finishedAt: now })
          .where(
            and(
              eq(agentRuns.organizationId, action.organizationId),
              eq(agentRuns.id, action.runId),
              eq(agentRuns.status, "waiting_approval")
            )
          )
      }
      return { action: decided, expired: false }
    })
    if (outcome.expired) {
      throw publicErrors.conflict("Agent action expired", {
        reason: "action_expired",
        resource: "agent_action",
      })
    }
    return toActionDto(outcome.action)
  } catch (cause) {
    if (attempt < 4 && isActionWriteRetryableRace(cause)) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
      return decideAgentActionForSessionWithRetry(db, input, attempt + 1)
    }
    return preserveAgentActionError(cause, "decideAgentActionForSession")
  }
}

export const decideAgentActionForSession = async (
  db: Db,
  input: DecideAgentActionInput
): Promise<AgentIssueAction> =>
  withAgentActionLock(`action:${input.actionId}`, () =>
    decideAgentActionForSessionWithRetry(db, input)
  )

export type AgentActionResumePreparation =
  | { kind: "receipt"; result: AgentActionExecutionResult }
  | { kind: "ticket"; resume: AgentResumeTicket }

export const prepareAgentActionResumeForSession = async (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string; now?: Date }
): Promise<AgentActionResumePreparation> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const action = await requirePublicAction(tx, { ...input, now })
      if (action.status === "succeeded") {
        return {
          kind: "receipt",
          result: executionResult(action, action.receipt),
        }
      }
      if (
        action.status !== "approved" ||
        action.decisionProvenance !== "manual" ||
        action.expiresAt.getTime() <= now.getTime()
      ) {
        throw publicErrors.conflict("Agent action cannot be resumed", {
          reason: "action_not_approved",
          resource: "agent_action",
        })
      }
      const credential = await createAgentToken()
      await tx
        .update(agentResumeTickets)
        .set({ revokedAt: now })
        .where(
          and(
            eq(agentResumeTickets.organizationId, action.organizationId),
            eq(agentResumeTickets.actionId, action.id),
            isNull(agentResumeTickets.consumedAt),
            isNull(agentResumeTickets.revokedAt)
          )
        )
      const expiresAt = new Date(
        Math.min(
          now.getTime() + AGENT_RESUME_TICKET_MAX_LIFETIME_MS,
          action.expiresAt.getTime()
        )
      )
      if (expiresAt.getTime() <= now.getTime()) {
        throw publicErrors.conflict("Agent action expired", {
          reason: "action_expired",
          resource: "agent_action",
        })
      }
      await tx.insert(agentResumeTickets).values({
        id: crypto.randomUUID(),
        tokenHash: credential.tokenHash,
        actionId: action.id,
        organizationId: action.organizationId,
        threadId: action.threadId,
        sessionId: action.sessionId,
        userId: action.userId,
        contextEpoch: action.contextEpoch,
        issuedAt: now,
        expiresAt,
      })
      return {
        kind: "ticket",
        resume: {
          ticket: credential.token,
          expiresAt: expiresAt.toISOString(),
        },
      }
    })
  } catch (cause) {
    return preserveAgentActionError(cause, "prepareAgentActionResumeForSession")
  }
}

/** @internal */
export const issueAgentActionResumeTicket = async (
  db: Db,
  input: { actionId: string; sessionId: string; userId: string; now?: Date }
): Promise<AgentResumeTicket> => {
  const preparation = await prepareAgentActionResumeForSession(db, input)
  if (preparation.kind === "receipt") {
    throw publicErrors.conflict("Agent action is already complete", {
      reason: "idempotency_conflict",
      resource: "agent_action",
    })
  }
  return preparation.resume
}
