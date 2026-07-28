import {
  agentGrants,
  agentRuns,
  agentSessionContexts,
  agentThreads,
  member,
  session,
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

type GrantRunIdentity = Pick<
  typeof agentGrants.$inferSelect,
  | "contextEpoch"
  | "organizationId"
  | "revokedAt"
  | "runId"
  | "sessionId"
  | "threadId"
  | "userId"
>

type GrantRunContext = Pick<
  ValidGrant,
  "resumedActionId" | "rootRunId" | "runScope" | "runStatus"
>

const validateRunGrantInTransaction = async (
  tx: AgentTransaction,
  grant: GrantRunIdentity,
  input: {
    allowRevokedTerminalRun?: boolean
    allowTerminalRun?: boolean
    now: Date
  }
): Promise<GrantRunContext> => {
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
  const run = runRows[0]
  if (!run) {
    throw publicErrors.unauthorized("Agent capability is invalid")
  }
  const active = run.status === "running" || run.status === "waiting_approval"
  if (!input.allowTerminalRun && !active) {
    throw publicErrors.conflict("Agent run is no longer active", {
      resource: "agent_run",
    })
  }
  if (
    grant.revokedAt !== null &&
    (!input.allowTerminalRun || !input.allowRevokedTerminalRun || active)
  ) {
    throw publicErrors.unauthorized("Agent capability is invalid")
  }
  return {
    runStatus: run.status,
    runScope: run.scope,
    rootRunId: run.rootRunId,
    resumedActionId: run.resumedActionId,
  }
}

export const validateGrantInTransaction = async (
  tx: AgentTransaction,
  input: {
    tokenHash: string
    kind: "connection" | "run"
    now: Date
    allowTerminalRun?: boolean
    allowRevokedTerminalRun?: boolean
  }
): Promise<ValidGrant> => {
  if (
    input.allowRevokedTerminalRun &&
    (input.kind !== "run" || !input.allowTerminalRun)
  ) {
    throw new Error("Revoked grant validation requires a terminal run")
  }
  const grantConditions = [
    eq(agentGrants.tokenHash, input.tokenHash),
    eq(agentGrants.kind, input.kind),
    gt(agentGrants.expiresAt, input.now),
  ]
  if (!input.allowRevokedTerminalRun) {
    grantConditions.push(isNull(agentGrants.revokedAt))
  }
  const grantRows = await tx
    .select()
    .from(agentGrants)
    .where(and(...grantConditions))
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

  const runContext: GrantRunContext =
    input.kind === "run"
      ? await validateRunGrantInTransaction(tx, grant, input)
      : {
          runStatus: null,
          runScope: null,
          rootRunId: null,
          resumedActionId: null,
        }

  return {
    organizationId: grant.organizationId,
    threadId: grant.threadId,
    runId: grant.runId,
    sessionId: grant.sessionId,
    userId: grant.userId,
    contextEpoch: grant.contextEpoch,
    webSearchQueryHash: grant.webSearchQueryHash,
    role,
    ...runContext,
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
    webSearchQueryHash?: string | null
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
    webSearchQueryHash: input.webSearchQueryHash,
    issuedAt: input.now,
    expiresAt,
  })
  return expiresAt
}
