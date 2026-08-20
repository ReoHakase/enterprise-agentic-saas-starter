import type { AgentConnection } from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentConnectionTickets,
  agentSessionContexts,
  organization,
  session,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, isNull } from "drizzle-orm"

import { HttpError } from "../../../errors/http-error"
import { revokeAgentSessionContextInTransaction } from "../context/repository"
import { createAgentToken, hashAgentToken } from "../crypto"
import {
  createGrantInTransaction,
  requireActiveMembership,
  requireLiveSession,
  requireOwnedThread,
} from "./auth-repository"
import { toOrganizationContext } from "./repository-support"

export const revokeCurrentAgentContext = async (
  db: Db,
  input: { sessionId: string; userId: string; now?: Date }
) =>
  await db.transaction(async (tx) => {
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
    if (!rows[0]) throw new HttpError({ code: "unauthorized" })
    const contextEpoch = await revokeAgentSessionContextInTransaction(tx, {
      ...input,
      now,
    })
    return { contextEpoch }
  })

export const consumeAgentConnectionTicket = async (
  db: Db,
  input: { ticket: string; threadId: string; now?: Date }
): Promise<AgentConnection> => {
  const [ticketHash, grantCredential] = await Promise.all([
    hashAgentToken(input.ticket),
    createAgentToken(),
  ])
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
      throw new HttpError({ code: "unauthorized" })
    }
    const current = await requireLiveSession(tx, {
      sessionId: ticket.sessionId,
      userId: ticket.userId,
      now,
    })
    if (current.activeOrganizationId !== ticket.organizationId) {
      throw new HttpError({ code: "active_organization_mismatch" })
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
      throw new HttpError({ code: "unauthorized" })
    }
    const grantExpiresAt = await createGrantInTransaction(tx, {
      tokenHash: grantCredential.tokenHash,
      kind: "connection",
      organizationId: ticket.organizationId,
      threadId: ticket.threadId,
      sessionId: ticket.sessionId,
      userId: ticket.userId,
      contextEpoch: ticket.contextEpoch,
      webSearchQueryHash: ticket.webSearchQueryHash,
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
      throw new HttpError({ code: "unauthorized" })
    }
    return {
      grant: grantCredential.token,
      expiresAt: grantExpiresAt.toISOString(),
      memoryResourceId: `resource_${(
        await hashAgentToken(`${ticket.organizationId}\u0000${ticket.userId}`)
      ).slice(0, 96)}`,
      user: account,
      organization: toOrganizationContext({ ...activeOrganization, role }),
      thread: { id: thread.id, title: "New conversation" },
    }
  })
}
