import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentActionAssets,
  agentActions,
  agentApprovalPolicies,
  agentConnectionTickets,
  agentGrants,
  agentResumeTickets,
  agentRuns,
  agentSessionContexts,
  agentThreads,
  issues,
  member,
  organization,
  session,
  user,
  type AgentRunScope,
  type AgentRunStatus,
} from "@enterprise-agentic-saas/db/schema"
import { and, asc, desc, eq, gt, inArray, isNull, like, sql } from "drizzle-orm"

import type {
  AgentAccountContext,
  AgentConnection,
  AgentIssue,
  AgentIssueLabel,
  AgentMember,
  AgentOrganizationContext,
  AgentRunGrant,
  AgentRunResult,
  AgentSearchIssuesInput,
} from "../../agent-client"
import { AppError, publicErrors } from "../../errors/app-error"
import { normalizeOrganizationRole } from "../authorization/roles"
import { bindAgentAssetsToRunInTransaction } from "../files/agent-run-assets-repository"
import {
  findIssueById,
  findIssueByNumber,
  listIssuesByOrganization,
  type IssueDto,
} from "../issues/repository"
import {
  ensureAgentSessionContextInTransaction,
  revokeAgentSessionContextInTransaction,
} from "./context-repository"
import { createAgentToken, hashAgentToken } from "./crypto"

export type AgentTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

export type AgentThreadDto = {
  id: string
  title: string
  status: "active" | "archived"
  createdAt: string
  updatedAt: string
}

type LiveSession = {
  id: string
  userId: string
  activeOrganizationId: string
}

export type ValidGrant = {
  organizationId: string
  threadId: string
  runId: string | null
  sessionId: string
  userId: string
  contextEpoch: number
  role: ReturnType<typeof normalizeOrganizationRole>
  runStatus: AgentRunStatus | null
  runScope: AgentRunScope | null
  rootRunId: string | null
  resumedActionId: string | null
}

const CONNECTION_TICKET_TTL_MS = 60_000
const AGENT_GRANT_TTL_MS = 5 * 60_000
const AGENT_RUN_TTL_MS = 5 * 60_000

const toThreadDto = (
  thread: typeof agentThreads.$inferSelect
): AgentThreadDto => ({
  id: thread.id,
  title: thread.title,
  status: thread.status,
  createdAt: thread.createdAt.toISOString(),
  updatedAt: thread.updatedAt.toISOString(),
})

const toAgentIssue = (issue: IssueDto): AgentIssue => ({
  id: issue.id,
  number: issue.number,
  title: issue.title,
  description: issue.description,
  status: issue.status,
  priority: issue.priority,
  assigneeId: issue.assigneeId,
  labels: issue.labels,
  dueDate: issue.dueDate,
  revision: issue.revision,
  createdAt: issue.createdAt,
  updatedAt: issue.updatedAt,
})

const permissionsForAgent = (
  role: ReturnType<typeof normalizeOrganizationRole>
): AgentOrganizationContext["permissions"] => ({
  canReadIssues: true,
  canCreateIssues: true,
  canUpdateIssues: true,
  canDeleteOwnIssues: true,
  canDeleteAnyIssue: role !== "member",
})

const toOrganizationContext = (input: {
  name: string
  slug: string
  role: string
}): AgentOrganizationContext => {
  const role = normalizeOrganizationRole(input.role)
  return {
    name: input.name,
    slug: input.slug,
    role,
    permissions: permissionsForAgent(role),
  }
}

const preserveAgentError = (cause: unknown, operation: string): never => {
  if (cause instanceof AppError) throw cause
  throw publicErrors.internal(cause, { module: "agent", operation })
}

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
        .select()
        .from(agentThreads)
        .where(
          and(
            eq(agentThreads.organizationId, current.activeOrganizationId),
            eq(agentThreads.ownerUserId, input.userId),
            eq(agentThreads.status, "active")
          )
        )
        .orderBy(desc(agentThreads.updatedAt), desc(agentThreads.id))
      return rows.map(toThreadDto)
    })
  } catch (cause) {
    return preserveAgentError(cause, "listAgentThreadsForSession")
  }
}

export const createAgentThreadForSession = async (
  db: Db,
  input: { sessionId: string; userId: string; title: string; now?: Date }
): Promise<AgentThreadDto> => {
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const current = await requireLiveSession(tx, { ...input, now })
      await requireActiveMembership(tx, current)
      const rows = await tx
        .insert(agentThreads)
        .values({
          id: crypto.randomUUID(),
          organizationId: current.activeOrganizationId,
          ownerUserId: input.userId,
          title: input.title,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      const thread = rows[0]
      if (!thread) throw new Error("Agent thread insert returned no row")
      return toThreadDto(thread)
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
      if (thread.status === "archived") return toThreadDto(thread)

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
      return toThreadDto(archived)
    })
  } catch (cause) {
    return preserveAgentError(cause, "archiveAgentThreadForSession")
  }
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
      const context = await ensureAgentSessionContextInTransaction(tx, {
        sessionId: input.sessionId,
        userId: input.userId,
        now,
      })
      const expiresAt = new Date(now.getTime() + CONNECTION_TICKET_TTL_MS)
      await tx.insert(agentConnectionTickets).values({
        id: crypto.randomUUID(),
        tokenHash: credential.tokenHash,
        organizationId: current.activeOrganizationId,
        threadId: input.threadId,
        sessionId: input.sessionId,
        userId: input.userId,
        contextEpoch: context.contextEpoch,
        issuedAt: now,
        expiresAt,
      })
      return { ticket: credential.token, expiresAt: expiresAt.toISOString() }
    })
  } catch (cause) {
    return preserveAgentError(cause, "issueAgentConnectionTicket")
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

export const startAgentRun = async (
  db: Db,
  input: {
    grant: string
    clientMessageId: string
    assetIds?: string[]
    now?: Date
  }
): Promise<AgentRunGrant> => {
  const [tokenHash, runCredential] = await Promise.all([
    hashAgentToken(input.grant),
    createAgentToken(),
  ])
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const context = await validateGrantInTransaction(tx, {
        tokenHash,
        kind: "connection",
        now,
      })
      const generatedRunId = crypto.randomUUID()
      const expiresAt = new Date(now.getTime() + AGENT_RUN_TTL_MS)
      const insertedRows = await tx
        .insert(agentRuns)
        .values({
          id: generatedRunId,
          organizationId: context.organizationId,
          threadId: context.threadId,
          rootRunId: generatedRunId,
          sessionId: context.sessionId,
          userId: context.userId,
          contextEpoch: context.contextEpoch,
          clientMessageId: input.clientMessageId,
          status: "running",
          scope: "chat",
          startedAt: now,
          expiresAt,
        })
        .onConflictDoNothing()
        .returning()
      let run = insertedRows[0]
      if (!run) {
        const existingRows = await tx
          .select()
          .from(agentRuns)
          .where(
            and(
              eq(agentRuns.threadId, context.threadId),
              eq(agentRuns.clientMessageId, input.clientMessageId)
            )
          )
          .limit(1)
        run = existingRows[0]
        if (
          !run ||
          run.organizationId !== context.organizationId ||
          run.sessionId !== context.sessionId ||
          run.userId !== context.userId ||
          run.contextEpoch !== context.contextEpoch ||
          run.status !== "running" ||
          run.expiresAt.getTime() <= now.getTime()
        ) {
          throw publicErrors.conflict("Agent message id is already in use", {
            reason: "idempotency_conflict",
            resource: "agent_run",
          })
        }
      }
      await bindAgentAssetsToRunInTransaction(tx, {
        assetIds: input.assetIds ?? [],
        context,
        now,
        runId: run.id,
      })
      const grantExpiresAt = await createGrantInTransaction(tx, {
        tokenHash: runCredential.tokenHash,
        kind: "run",
        organizationId: run.organizationId,
        threadId: run.threadId,
        runId: run.id,
        sessionId: run.sessionId,
        userId: run.userId,
        contextEpoch: run.contextEpoch,
        now,
        expiresAt: run.expiresAt,
      })
      return {
        runId: run.id,
        rootRunId: run.rootRunId,
        grant: runCredential.token,
        expiresAt: grantExpiresAt.toISOString(),
      }
    })
  } catch (cause) {
    return preserveAgentError(cause, "startAgentRun")
  }
}

const transitionAgentRun = async (
  db: Db,
  input: {
    grant: string
    status: "completed" | "failed" | "canceled"
    now?: Date
  }
): Promise<AgentRunResult> => {
  const tokenHash = await hashAgentToken(input.grant)
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const context = await validateGrantInTransaction(tx, {
        tokenHash,
        kind: "run",
        now,
        allowTerminalRun: true,
      })
      if (!context.runId || !context.runStatus) {
        throw publicErrors.unauthorized("Agent capability is invalid")
      }
      if (context.runStatus === input.status) {
        return { runId: context.runId, status: context.runStatus }
      }
      if (
        context.runStatus !== "running" &&
        context.runStatus !== "waiting_approval"
      ) {
        throw publicErrors.conflict("Agent run is already terminal", {
          resource: "agent_run",
        })
      }
      const rows = await tx
        .update(agentRuns)
        .set({ status: input.status, finishedAt: now })
        .where(
          and(
            eq(agentRuns.id, context.runId),
            eq(agentRuns.organizationId, context.organizationId),
            inArray(agentRuns.status, ["running", "waiting_approval"])
          )
        )
        .returning({ id: agentRuns.id, status: agentRuns.status })
      const run = rows[0]
      if (!run) {
        throw publicErrors.conflict("Agent run changed concurrently", {
          resource: "agent_run",
        })
      }
      await tx
        .update(agentGrants)
        .set({ revokedAt: now })
        .where(
          and(
            eq(agentGrants.organizationId, context.organizationId),
            eq(agentGrants.runId, context.runId),
            isNull(agentGrants.revokedAt)
          )
        )
      return { runId: run.id, status: run.status }
    })
  } catch (cause) {
    return preserveAgentError(cause, "transitionAgentRun")
  }
}

export const cancelAgentRun = (db: Db, input: { grant: string; now?: Date }) =>
  transitionAgentRun(db, { ...input, status: "canceled" })

export const finishAgentRun = (
  db: Db,
  input: { grant: string; outcome: "completed" | "failed"; now?: Date }
) => transitionAgentRun(db, { ...input, status: input.outcome })

const withRunGrant = async <T>(
  db: Db,
  input: { grant: string; now?: Date },
  operation: (tx: AgentTransaction, context: ValidGrant) => Promise<T>
): Promise<T> => {
  const tokenHash = await hashAgentToken(input.grant)
  return db.transaction(async (tx) => {
    const context = await validateGrantInTransaction(tx, {
      tokenHash,
      kind: "run",
      now: input.now ?? new Date(),
    })
    return operation(tx, context)
  })
}

export const readAgentAccountContext = async (
  db: Db,
  input: { grant: string; now?: Date }
): Promise<AgentAccountContext> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const rows = await tx
        .select({ name: user.name, profileImage: user.image })
        .from(user)
        .where(eq(user.id, context.userId))
        .limit(1)
      const account = rows[0]
      if (!account) throw publicErrors.unauthorized()
      return account
    })
  } catch (cause) {
    return preserveAgentError(cause, "readAgentAccountContext")
  }
}

export const readAgentActiveOrganization = async (
  db: Db,
  input: { grant: string; now?: Date }
): Promise<AgentOrganizationContext> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const rows = await tx
        .select({
          name: organization.name,
          slug: organization.slug,
        })
        .from(organization)
        .where(eq(organization.id, context.organizationId))
        .limit(1)
      const active = rows[0]
      if (!active) {
        throw publicErrors.notFound("Organization not found", {
          resource: "organization",
        })
      }
      return toOrganizationContext({ ...active, role: context.role })
    })
  } catch (cause) {
    return preserveAgentError(cause, "readAgentActiveOrganization")
  }
}

export const searchAgentOrganizationMembers = async (
  db: Db,
  input: { grant: string; query: string; limit: number; now?: Date }
): Promise<AgentMember[]> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const condition = input.query
        ? and(
            eq(member.organizationId, context.organizationId),
            like(user.name, `%${input.query}%`)
          )
        : eq(member.organizationId, context.organizationId)
      const rows = await tx
        .select({
          id: user.id,
          name: user.name,
          profileImage: user.image,
          role: member.role,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(condition)
        .orderBy(asc(user.name), asc(user.id))
        .limit(input.limit)
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        profileImage: row.profileImage,
        role: normalizeOrganizationRole(row.role),
      }))
    })
  } catch (cause) {
    return preserveAgentError(cause, "searchAgentOrganizationMembers")
  }
}

export const searchAgentIssueLabels = async (
  db: Db,
  input: { grant: string; query: string; limit: number; now?: Date }
): Promise<AgentIssueLabel[]> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const query = input.query.toLowerCase()
      const rows = await tx.all<{
        label: string
        usageCount: number | string
      }>(sql`
        select min(trim(cast(json_each.value as text))) as label,
               count(*) as usageCount
        from ${issues}, json_each(${issues.labels})
        where ${issues.organizationId} = ${context.organizationId}
          and trim(cast(json_each.value as text)) != ''
          and (${query} = '' or lower(trim(cast(json_each.value as text))) like ${`%${query}%`})
        group by lower(trim(cast(json_each.value as text)))
        order by count(*) desc, label asc
        limit ${input.limit}
      `)
      return rows.map((row) => ({
        label: row.label,
        usageCount: Number(row.usageCount),
      }))
    })
  } catch (cause) {
    return preserveAgentError(cause, "searchAgentIssueLabels")
  }
}

export const searchAgentIssues = async (
  db: Db,
  input: AgentSearchIssuesInput & { now?: Date }
): Promise<AgentIssue[]> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const rows = await listIssuesByOrganization(tx, {
        organizationId: context.organizationId,
        search: input.search,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        label: input.label,
        sortBy: input.sortBy,
        sortDirection: input.sortDirection,
        limit: input.limit ?? 50,
      })
      return rows.map(toAgentIssue)
    })
  } catch (cause) {
    return preserveAgentError(cause, "searchAgentIssues")
  }
}

export const getAgentIssue = async (
  db: Db,
  input:
    | { grant: string; lookup: "id"; id: string; now?: Date }
    | { grant: string; lookup: "number"; number: number; now?: Date }
): Promise<AgentIssue> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      const issue =
        input.lookup === "id"
          ? await findIssueById(tx, {
              organizationId: context.organizationId,
              id: input.id,
            })
          : await findIssueByNumber(tx, {
              organizationId: context.organizationId,
              number: input.number,
            })
      if (!issue) {
        throw publicErrors.notFound("Issue not found", { resource: "issue" })
      }
      return toAgentIssue(issue)
    })
  } catch (cause) {
    return preserveAgentError(cause, "getAgentIssue")
  }
}
