import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentConnectionTickets,
  agentMessages,
  agentSessionContexts,
  agentThreadContextSummaries,
  organization,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, gt, isNull } from "drizzle-orm"

import type {
  AgentCanonicalMessage,
  AgentConnection,
} from "../../../agent-client"
import { publicErrors } from "../../../errors/app-error"
import { revokeAgentSessionContextInTransaction } from "../context/repository"
import { createAgentToken, hashAgentToken } from "../crypto"
import {
  createGrantInTransaction,
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
} from "./auth-repository"
import {
  listCanonicalMessagesInTransaction,
  preserveAgentError,
  toOrganizationContext,
  UI_HISTORY_CHARACTER_LIMIT,
  UI_HISTORY_MESSAGE_LIMIT,
} from "./repository-support"

export const listAgentMessagesForSession = async (
  db: Db,
  input: { sessionId: string; threadId: string; userId: string; now?: Date }
): Promise<AgentCanonicalMessage[]> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const current = await requireLiveSession(tx, { ...input, now })
      await requireActiveMembership(tx, current)
      const thread = await requireOwnedThread(tx, {
        threadId: input.threadId,
        userId: input.userId,
        activeOrganizationId: current.activeOrganizationId,
      })
      return listCanonicalMessagesInTransaction(tx, {
        organizationId: current.activeOrganizationId,
        threadId: thread.id,
        messageLimit: UI_HISTORY_MESSAGE_LIMIT,
        characterLimit: UI_HISTORY_CHARACTER_LIMIT,
      })
    })
  } catch (cause) {
    return preserveAgentError(cause, "listAgentMessagesForSession")
  }
}

export const getAgentThreadContextForSession = async (
  db: Db,
  input: { sessionId: string; threadId: string; userId: string; now?: Date }
) => {
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
      const [messageRows, summaryRows] = await Promise.all([
        tx
          .select({ content: agentMessages.content })
          .from(agentMessages)
          .where(
            and(
              eq(agentMessages.organizationId, thread.organizationId),
              eq(agentMessages.threadId, thread.id)
            )
          ),
        tx
          .select({
            throughSequence: agentThreadContextSummaries.throughSequence,
            estimatedTokenCount:
              agentThreadContextSummaries.estimatedTokenCount,
          })
          .from(agentThreadContextSummaries)
          .where(
            and(
              eq(
                agentThreadContextSummaries.organizationId,
                thread.organizationId
              ),
              eq(agentThreadContextSummaries.threadId, thread.id)
            )
          )
          .orderBy(
            desc(agentThreadContextSummaries.throughSequence),
            desc(agentThreadContextSummaries.createdAt)
          )
          .limit(1),
      ])
      const summary = summaryRows[0]
      return {
        threadId: thread.id,
        messageCount: messageRows.length,
        estimatedHistoryTokens: Math.ceil(
          messageRows.reduce(
            (characters, message) =>
              characters + JSON.stringify(message.content).length,
            0
          ) / 4
        ),
        latestSummaryThroughSequence: summary?.throughSequence ?? null,
        latestSummaryEstimatedTokens: summary?.estimatedTokenCount ?? null,
      }
    })
  } catch (cause) {
    return preserveAgentError(cause, "getAgentThreadContextForSession")
  }
}

export const revokeCurrentAgentContext = async (
  db: Db,
  input: { sessionId: string; userId: string; now?: Date }
) => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const rows = await tx
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.id, input.sessionId),
            eq(session.userId, input.userId),
            gt(session.expiresAt, now)
          )
        )
        .limit(1)
      if (!rows[0]) throw publicErrors.unauthorized()
      const contextEpoch = await revokeAgentSessionContextInTransaction(tx, {
        ...input,
        now,
      })
      return { contextEpoch }
    })
  } catch (cause) {
    return preserveAgentError(cause, "revokeCurrentAgentContext")
  }
}

export const consumeAgentConnectionTicket = async (
  db: Db,
  input: { ticket: string; threadId: string; now?: Date }
): Promise<AgentConnection> => {
  const [ticketHash, grantCredential] = await Promise.all([
    hashAgentToken(input.ticket),
    createAgentToken(),
  ])
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const ticketRows = await tx
        .update(agentConnectionTickets)
        .set({ consumedAt: now })
        .where(
          and(
            eq(agentConnectionTickets.tokenHash, ticketHash),
            eq(agentConnectionTickets.threadId, input.threadId),
            isNull(agentConnectionTickets.consumedAt),
            isNull(agentConnectionTickets.revokedAt),
            gt(agentConnectionTickets.expiresAt, now)
          )
        )
        .returning()
      const ticket = ticketRows[0]
      if (!ticket) {
        throw publicErrors.unauthorized("Agent connection ticket is invalid")
      }
      const current = await requireLiveSession(tx, {
        sessionId: ticket.sessionId,
        userId: ticket.userId,
        now,
      })
      if (current.activeOrganizationId !== ticket.organizationId) {
        throw publicErrors.activeOrganizationMismatch()
      }
      const role = await requireActiveMembership(tx, current)
      const thread = await requireOwnedThread(tx, {
        threadId: ticket.threadId,
        userId: ticket.userId,
        activeOrganizationId: ticket.organizationId,
      })
      const contextRows = await tx
        .select()
        .from(agentSessionContexts)
        .where(eq(agentSessionContexts.sessionId, ticket.sessionId))
        .limit(1)
      const context = contextRows[0]
      if (
        !context ||
        context.userId !== ticket.userId ||
        context.contextEpoch !== ticket.contextEpoch
      ) {
        throw publicErrors.unauthorized("Agent connection ticket is invalid")
      }
      const grantExpiresAt = await createGrantInTransaction(tx, {
        tokenHash: grantCredential.tokenHash,
        kind: "connection",
        organizationId: ticket.organizationId,
        threadId: ticket.threadId,
        sessionId: ticket.sessionId,
        userId: ticket.userId,
        contextEpoch: ticket.contextEpoch,
        now,
      })
      const userRows = await tx
        .select({ name: user.name, profileImage: user.image })
        .from(user)
        .where(eq(user.id, ticket.userId))
        .limit(1)
      const organizationRows = await tx
        .select({
          name: organization.name,
          slug: organization.slug,
        })
        .from(organization)
        .where(eq(organization.id, ticket.organizationId))
        .limit(1)
      const account = userRows[0]
      const activeOrganization = organizationRows[0]
      if (!account || !activeOrganization) {
        throw publicErrors.unauthorized("Agent connection ticket is invalid")
      }
      return {
        grant: grantCredential.token,
        expiresAt: grantExpiresAt.toISOString(),
        user: account,
        organization: toOrganizationContext({ ...activeOrganization, role }),
        thread: { id: thread.id, title: thread.title },
      }
    })
  } catch (cause) {
    return preserveAgentError(cause, "consumeAgentConnectionTicket")
  }
}
