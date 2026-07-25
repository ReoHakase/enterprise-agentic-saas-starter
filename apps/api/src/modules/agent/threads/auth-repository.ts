import {
  agentGrants,
  agentRuns,
  agentSessionContexts,
  agentThreads,
  member,
  session,
  type AgentRunScope,
  type AgentRunStatus,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, isNull } from "drizzle-orm"

import { publicErrors } from "../../../errors/app-error"
import { normalizeOrganizationRole } from "../../authorization/public"
import {
  AGENT_GRANT_TTL_MS,
  type AgentTransaction,
  type LiveSession,
  type ValidGrant,
} from "./repository-support"

export const requireLiveSession = async (
  tx: AgentTransaction,
  input: { sessionId: string; userId: string; now: Date }
): Promise<LiveSession> => {
  const rows = await tx
    .select({
      id: session.id,
      userId: session.userId,
      activeOrganizationId: session.activeOrganizationId,
    })
    .from(session)
    .where(
      and(
        eq(session.id, input.sessionId),
        eq(session.userId, input.userId),
        gt(session.expiresAt, input.now)
      )
    )
    .limit(1)
  const current = rows[0]
  if (!current) throw publicErrors.unauthorized()
  if (!current.activeOrganizationId) {
    throw publicErrors.activeOrganizationRequired()
  }
  return {
    id: current.id,
    userId: current.userId,
    activeOrganizationId: current.activeOrganizationId,
  }
}

export const requireActiveMembership = async (
  tx: AgentTransaction,
  input: LiveSession
) => {
  const rows = await tx
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, input.userId),
        eq(member.organizationId, input.activeOrganizationId)
      )
    )
    .limit(1)
  const membership = rows[0]
  if (!membership) {
    throw publicErrors.notFound("Organization not found", {
      resource: "organization",
    })
  }
  return normalizeOrganizationRole(membership.role)
}

export const requireOwnedThread = async (
  tx: AgentTransaction,
  input: {
    threadId: string
    userId: string
    activeOrganizationId: string
    requireActive?: boolean
  }
) => {
  const rows = await tx
    .select()
    .from(agentThreads)
    .where(
      and(
        eq(agentThreads.id, input.threadId),
        eq(agentThreads.ownerUserId, input.userId),
        eq(agentThreads.organizationId, input.activeOrganizationId)
      )
    )
    .limit(1)
  const thread = rows[0]
  if (!thread) {
    throw publicErrors.notFound("Agent thread not found", {
      resource: "agent_thread",
    })
  }
  if (input.requireActive !== false && thread.status !== "active") {
    throw publicErrors.notFound("Agent thread not found", {
      resource: "agent_thread",
    })
  }
  return thread
}

export const validateGrantInTransaction = async (
  tx: AgentTransaction,
  input: {
    tokenHash: string
    kind: "connection" | "run"
    now: Date
    allowTerminalRun?: boolean
  }
): Promise<ValidGrant> => {
  const grantRows = await tx
    .select()
    .from(agentGrants)
    .where(
      and(
        eq(agentGrants.tokenHash, input.tokenHash),
        eq(agentGrants.kind, input.kind),
        isNull(agentGrants.revokedAt),
        gt(agentGrants.expiresAt, input.now)
      )
    )
    .limit(1)
  const grant = grantRows[0]
  if (!grant) throw publicErrors.unauthorized("Agent capability is invalid")

  const currentSession = await requireLiveSession(tx, {
    sessionId: grant.sessionId,
    userId: grant.userId,
    now: input.now,
  })
  if (currentSession.activeOrganizationId !== grant.organizationId) {
    throw publicErrors.activeOrganizationMismatch()
  }

  const contextRows = await tx
    .select()
    .from(agentSessionContexts)
    .where(eq(agentSessionContexts.sessionId, grant.sessionId))
    .limit(1)
  const context = contextRows[0]
  if (
    !context ||
    context.userId !== grant.userId ||
    context.contextEpoch !== grant.contextEpoch
  ) {
    throw publicErrors.unauthorized("Agent capability is invalid")
  }

  const role = await requireActiveMembership(tx, currentSession)
  const thread = await requireOwnedThread(tx, {
    threadId: grant.threadId,
    userId: grant.userId,
    activeOrganizationId: grant.organizationId,
  })
  if (thread.organizationId !== grant.organizationId) {
    throw publicErrors.notFound("Agent thread not found", {
      resource: "agent_thread",
    })
  }

  let runStatus: AgentRunStatus | null = null
  let runScope: AgentRunScope | null = null
  let rootRunId: string | null = null
  let resumedActionId: string | null = null
  if (input.kind === "run") {
    if (!grant.runId) {
      throw publicErrors.unauthorized("Agent capability is invalid")
    }
    const runRows = await tx
      .select({
        status: agentRuns.status,
        scope: agentRuns.scope,
        rootRunId: agentRuns.rootRunId,
        resumedActionId: agentRuns.resumedActionId,
      })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.id, grant.runId),
          eq(agentRuns.organizationId, grant.organizationId),
          eq(agentRuns.threadId, grant.threadId),
          eq(agentRuns.sessionId, grant.sessionId),
          eq(agentRuns.userId, grant.userId),
          eq(agentRuns.contextEpoch, grant.contextEpoch),
          gt(agentRuns.expiresAt, input.now)
        )
      )
      .limit(1)
    runStatus = runRows[0]?.status ?? null
    runScope = runRows[0]?.scope ?? null
    rootRunId = runRows[0]?.rootRunId ?? null
    resumedActionId = runRows[0]?.resumedActionId ?? null
    if (!runStatus) {
      throw publicErrors.unauthorized("Agent capability is invalid")
    }
    if (
      !input.allowTerminalRun &&
      runStatus !== "running" &&
      runStatus !== "waiting_approval"
    ) {
      throw publicErrors.conflict("Agent run is no longer active", {
        resource: "agent_run",
      })
    }
  }

  return {
    organizationId: grant.organizationId,
    threadId: grant.threadId,
    runId: grant.runId,
    sessionId: grant.sessionId,
    userId: grant.userId,
    contextEpoch: grant.contextEpoch,
    role,
    runStatus,
    runScope,
    rootRunId,
    resumedActionId,
  }
}

export const createGrantInTransaction = async (
  tx: AgentTransaction,
  input: {
    tokenHash: string
    kind: "connection" | "run"
    organizationId: string
    threadId: string
    runId?: string
    sessionId: string
    userId: string
    contextEpoch: number
    now: Date
    expiresAt?: Date
  }
) => {
  const expiresAt =
    input.expiresAt ?? new Date(input.now.getTime() + AGENT_GRANT_TTL_MS)
  await tx.insert(agentGrants).values({
    id: crypto.randomUUID(),
    tokenHash: input.tokenHash,
    kind: input.kind,
    organizationId: input.organizationId,
    threadId: input.threadId,
    runId: input.runId ?? null,
    sessionId: input.sessionId,
    userId: input.userId,
    contextEpoch: input.contextEpoch,
    issuedAt: input.now,
    expiresAt,
  })
  return expiresAt
}
