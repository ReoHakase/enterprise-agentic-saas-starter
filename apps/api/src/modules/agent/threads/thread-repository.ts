import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentActionAssets,
  agentActions,
  agentApprovalPolicies,
  agentConnectionTickets,
  agentGrants,
  agentMessages,
  agentResumeTickets,
  agentRuns,
  agentThreadPermissions,
  agentThreads,
  type AgentThreadPermissionMode,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { publicErrors } from "../../../errors/app-error"
import { ensureAgentSessionContextInTransaction } from "../context/repository"
import { createAgentToken } from "../crypto"
import {
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
} from "./auth-repository"
import {
  CONNECTION_TICKET_TTL_MS,
  preserveAgentError,
  toThreadDto,
  type AgentThreadDto,
  type AgentTransaction,
  type LiveSession,
} from "./repository-support"

export const listAgentThreadsForSession = async (
  db: Db,
  input: { sessionId: string; userId: string; now?: Date }
): Promise<AgentThreadDto[]> => {
  try {
    return await db.transaction(async (tx) => {
      const current = await requireLiveSession(tx, {
        ...input,
        now: input.now ?? new Date(),
      })
      await requireActiveMembership(tx, current)
      const rows = await tx
        .select({
          thread: agentThreads,
          messageCount: sql<number>`count(${agentMessages.id})`,
        })
        .from(agentThreads)
        .leftJoin(
          agentMessages,
          and(
            eq(agentMessages.organizationId, agentThreads.organizationId),
            eq(agentMessages.threadId, agentThreads.id)
          )
        )
        .where(
          and(
            eq(agentThreads.organizationId, current.activeOrganizationId),
            eq(agentThreads.ownerUserId, input.userId),
            eq(agentThreads.status, "active")
          )
        )
        .groupBy(agentThreads.id)
        .orderBy(desc(agentThreads.updatedAt), desc(agentThreads.id))
      return rows.map(({ messageCount, thread }) =>
        toThreadDto(thread, Number(messageCount))
      )
    })
  } catch (cause) {
    return preserveAgentError(cause, "listAgentThreadsForSession")
  }
}

export const createAgentThreadForSession = async (
  db: Db,
  input: {
    sessionId: string
    userId: string
    title: string
    permissionMode?: AgentThreadPermissionMode
    now?: Date
  }
): Promise<AgentThreadDto> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const current = await requireLiveSession(tx, { ...input, now })
      await requireActiveMembership(tx, current)
      const context = await ensureAgentSessionContextInTransaction(tx, {
        sessionId: input.sessionId,
        userId: input.userId,
        now,
      })
      const rows = await tx
        .insert(agentThreads)
        .values({
          id: crypto.randomUUID(),
          organizationId: current.activeOrganizationId,
          ownerUserId: input.userId,
          title: input.title,
          titleState: input.title === "New conversation" ? "untitled" : "agent",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      const thread = rows[0]
      if (!thread) throw new Error("Agent thread insert returned no row")
      await tx.insert(agentThreadPermissions).values({
        id: crypto.randomUUID(),
        organizationId: current.activeOrganizationId,
        threadId: thread.id,
        sessionId: input.sessionId,
        userId: input.userId,
        contextEpoch: context.contextEpoch,
        mode: input.permissionMode ?? "ask_always",
        createdAt: now,
        updatedAt: now,
      })
      return toThreadDto(thread, 0)
    })
  } catch (cause) {
    return preserveAgentError(cause, "createAgentThreadForSession")
  }
}

export const archiveAgentThreadForSession = async (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string; now?: Date }
): Promise<AgentThreadDto> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const current = await requireLiveSession(tx, { ...input, now })
      await requireActiveMembership(tx, current)
      const thread = await requireOwnedThread(tx, {
        threadId: input.threadId,
        userId: input.userId,
        activeOrganizationId: current.activeOrganizationId,
        requireActive: false,
      })
      const messageCountRows = await tx
        .select({ value: sql<number>`count(*)` })
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.organizationId, thread.organizationId),
            eq(agentMessages.threadId, thread.id)
          )
        )
      const messageCount = Number(messageCountRows[0]?.value ?? 0)
      if (thread.status === "archived") return toThreadDto(thread, messageCount)

      const rows = await tx
        .update(agentThreads)
        .set({ status: "archived", updatedAt: now })
        .where(
          and(
            eq(agentThreads.id, thread.id),
            eq(agentThreads.organizationId, thread.organizationId),
            eq(agentThreads.ownerUserId, input.userId),
            eq(agentThreads.status, "active")
          )
        )
        .returning()
      const archived = rows[0]
      if (!archived) {
        throw publicErrors.notFound("Agent thread not found", {
          resource: "agent_thread",
        })
      }
      await tx
        .update(agentConnectionTickets)
        .set({ revokedAt: now })
        .where(
          and(
            eq(agentConnectionTickets.organizationId, thread.organizationId),
            eq(agentConnectionTickets.threadId, thread.id),
            isNull(agentConnectionTickets.consumedAt),
            isNull(agentConnectionTickets.revokedAt)
          )
        )
      await tx
        .update(agentGrants)
        .set({ revokedAt: now })
        .where(
          and(
            eq(agentGrants.organizationId, thread.organizationId),
            eq(agentGrants.threadId, thread.id),
            isNull(agentGrants.revokedAt)
          )
        )
      await tx
        .update(agentRuns)
        .set({ status: "canceled", finishedAt: now })
        .where(
          and(
            eq(agentRuns.organizationId, thread.organizationId),
            eq(agentRuns.threadId, thread.id),
            inArray(agentRuns.status, ["running", "waiting_approval"])
          )
        )
      await tx
        .update(agentResumeTickets)
        .set({ revokedAt: now })
        .where(
          and(
            eq(agentResumeTickets.organizationId, thread.organizationId),
            eq(agentResumeTickets.threadId, thread.id),
            isNull(agentResumeTickets.consumedAt),
            isNull(agentResumeTickets.revokedAt)
          )
        )
      await tx
        .update(agentActions)
        .set({ status: "canceled", completedAt: now, updatedAt: now })
        .where(
          and(
            eq(agentActions.organizationId, thread.organizationId),
            eq(agentActions.threadId, thread.id),
            inArray(agentActions.status, ["pending", "approved"])
          )
        )
      await tx
        .update(agentApprovalPolicies)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(agentApprovalPolicies.organizationId, thread.organizationId),
            eq(agentApprovalPolicies.threadId, thread.id),
            isNull(agentApprovalPolicies.revokedAt)
          )
        )
      await tx
        .delete(agentThreadPermissions)
        .where(
          and(
            eq(agentThreadPermissions.organizationId, thread.organizationId),
            eq(agentThreadPermissions.threadId, thread.id)
          )
        )
      const threadActionIds = tx
        .select({ id: agentActions.id })
        .from(agentActions)
        .where(
          and(
            eq(agentActions.organizationId, thread.organizationId),
            eq(agentActions.threadId, thread.id)
          )
        )
      await tx
        .update(agentActionAssets)
        .set({ releasedAt: now })
        .where(
          and(
            inArray(agentActionAssets.actionId, threadActionIds),
            isNull(agentActionAssets.releasedAt)
          )
        )
      return toThreadDto(archived, messageCount)
    })
  } catch (cause) {
    return preserveAgentError(cause, "archiveAgentThreadForSession")
  }
}

export const issueConnectionTicketInTransaction = async (
  tx: AgentTransaction,
  input: {
    credential: Awaited<ReturnType<typeof createAgentToken>>
    current: LiveSession
    now: Date
    sessionId: string
    threadId: string
    userId: string
  }
) => {
  const context = await ensureAgentSessionContextInTransaction(tx, {
    sessionId: input.sessionId,
    userId: input.userId,
    now: input.now,
  })
  const expiresAt = new Date(input.now.getTime() + CONNECTION_TICKET_TTL_MS)
  await tx.insert(agentConnectionTickets).values({
    id: crypto.randomUUID(),
    tokenHash: input.credential.tokenHash,
    organizationId: input.current.activeOrganizationId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    userId: input.userId,
    contextEpoch: context.contextEpoch,
    issuedAt: input.now,
    expiresAt,
  })
  return { ticket: input.credential.token, expiresAt: expiresAt.toISOString() }
}

export const issueAgentConnectionTicket = async (
  db: Db,
  input: { sessionId: string; userId: string; threadId: string; now?: Date }
) => {
  const credential = await createAgentToken()
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const current = await requireLiveSession(tx, { ...input, now })
      await requireActiveMembership(tx, current)
      await requireOwnedThread(tx, {
        threadId: input.threadId,
        userId: input.userId,
        activeOrganizationId: current.activeOrganizationId,
      })
      return issueConnectionTicketInTransaction(tx, {
        credential,
        current,
        now,
        sessionId: input.sessionId,
        threadId: input.threadId,
        userId: input.userId,
      })
    })
  } catch (cause) {
    return preserveAgentError(cause, "issueAgentConnectionTicket")
  }
}
