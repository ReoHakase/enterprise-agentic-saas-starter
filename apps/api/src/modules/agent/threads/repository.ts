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
  agentSessionContexts,
  agentThreadContextSummaries,
  agentThreadPermissions,
  agentThreads,
  files,
  issues,
  member,
  organization,
  session,
  user,
  type AgentRunScope,
  type AgentRunStatus,
} from "@enterprise-agentic-saas/db/schema"
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  lte,
  sql,
} from "drizzle-orm"
import * as v from "valibot"

import type {
  AgentAccountContext,
  AgentCanonicalMessage,
  AgentCanonicalToolPart,
  AgentClientToolResult,
  AgentContentSegment,
  AgentCanonicalContextReference,
  AgentConnection,
  AgentContextReferenceInput,
  AgentIssue,
  AgentIssueLabel,
  AgentMember,
  AgentOrganizationContext,
  AgentRunGrant,
  AgentRunResult,
  AgentResolvedContextReference,
  AgentSearchIssuesInput,
} from "../../../agent-client"
import { AppError, publicErrors } from "../../../errors/app-error"
import { normalizeOrganizationRole } from "../../authorization/roles"
import { bindAgentAssetsToRunInTransaction } from "../../files/agent-run-assets-repository"
import {
  findIssueById,
  findIssueByNumber,
  listIssuesByOrganization,
  type IssueDto,
} from "../../issues/repository"
import {
  ensureAgentSessionContextInTransaction,
  revokeAgentSessionContextInTransaction,
} from "../context/repository"
import { createAgentToken, hashAgentToken } from "../crypto"
import { agentCanonicalMessageModel } from "../model"
import { reserveAgentModelRunInTransaction } from "../usage/resource-limits"

export type AgentTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0]

export type AgentThreadDto = {
  id: string
  title: string
  titleRevision: number
  status: "active" | "archived"
  messageCount: number
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
const MODEL_HISTORY_MESSAGE_LIMIT = 200
const MODEL_HISTORY_CHARACTER_LIMIT = 4_000_000
const MODEL_RECENT_MESSAGE_COUNT_AFTER_COMPACTION = 12
const MODEL_CONTEXT_COMPACTION_TOKEN_THRESHOLD = 950_000
const UI_HISTORY_MESSAGE_LIMIT = 40
const UI_HISTORY_CHARACTER_LIMIT = 1_000_000

const clientToolNames = new Set([
  "ui_navigate",
  "ui_open_issue",
  "ui_patch_form_draft",
  "ui_read_form_draft",
  "ui_set_issue_query",
])

const toThreadDto = (
  thread: typeof agentThreads.$inferSelect,
  messageCount: number
): AgentThreadDto => ({
  id: thread.id,
  title: thread.title,
  titleRevision: thread.titleRevision,
  status: thread.status,
  messageCount,
  createdAt: thread.createdAt.toISOString(),
  updatedAt: thread.updatedAt.toISOString(),
})

const toCanonicalMessage = (
  message: typeof agentMessages.$inferSelect
): AgentCanonicalMessage =>
  v.parse(agentCanonicalMessageModel, {
    id: message.clientMessageId ?? message.id,
    role: message.role,
    parts: message.content.parts,
  })

const parseCanonicalMessage = <Role extends AgentCanonicalMessage["role"]>(
  message: unknown,
  role: Role
): AgentCanonicalMessage & { role: Role } => {
  const parsed = v.safeParse(agentCanonicalMessageModel, message)
  if (!parsed.success || !canonicalMessageHasRole(parsed.output, role)) {
    throw publicErrors.validation("Invalid agent message")
  }
  return parsed.output
}

const canonicalMessageHasRole = <Role extends AgentCanonicalMessage["role"]>(
  message: AgentCanonicalMessage,
  role: Role
): message is AgentCanonicalMessage & { role: Role } => message.role === role

const boundedCanonicalMessages = (
  messages: AgentCanonicalMessage[],
  characterLimit: number
): AgentCanonicalMessage[] => {
  const selected: AgentCanonicalMessage[] = []
  let characters = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue
    const size = JSON.stringify(message).length
    if (selected.length > 0 && characters + size > characterLimit) break
    selected.push(message)
    characters += size
  }
  return selected.toReversed()
}

const listCanonicalMessagesInTransaction = async (
  tx: AgentTransaction,
  input: {
    organizationId: string
    threadId: string
    messageLimit: number
    characterLimit: number
  }
): Promise<AgentCanonicalMessage[]> => {
  const rows = await tx
    .select()
    .from(agentMessages)
    .where(
      and(
        eq(agentMessages.organizationId, input.organizationId),
        eq(agentMessages.threadId, input.threadId)
      )
    )
    .orderBy(desc(agentMessages.sequence))
    .limit(input.messageLimit)
  return boundedCanonicalMessages(
    rows.toReversed().map(toCanonicalMessage),
    input.characterLimit
  )
}

const compactedMessageLine = (
  message: typeof agentMessages.$inferSelect
): string => {
  const parts = toCanonicalMessage(message)
    .parts.map((part) => {
      if (part.type === "text" || part.type === "reasoning") return part.text
      if (part.type.startsWith("tool-")) {
        return `${part.type}: ${JSON.stringify("output" in part ? part.output : undefined)}`
      }
      return ""
    })
    .filter(Boolean)
    .join(" ")
  return `${message.role}: ${parts}`.slice(0, 4_000)
}

const listModelContextInTransaction = async (
  tx: AgentTransaction,
  input: { organizationId: string; threadId: string }
): Promise<AgentCanonicalMessage[]> => {
  const rows = await tx
    .select()
    .from(agentMessages)
    .where(
      and(
        eq(agentMessages.organizationId, input.organizationId),
        eq(agentMessages.threadId, input.threadId)
      )
    )
    .orderBy(desc(agentMessages.sequence))
    .limit(MODEL_HISTORY_MESSAGE_LIMIT)
  const ordered = rows.toReversed()
  const estimatedTokens = Math.ceil(JSON.stringify(ordered).length / 4)
  if (
    estimatedTokens < MODEL_CONTEXT_COMPACTION_TOKEN_THRESHOLD ||
    ordered.length <= MODEL_RECENT_MESSAGE_COUNT_AFTER_COMPACTION
  ) {
    return boundedCanonicalMessages(
      ordered.map(toCanonicalMessage),
      MODEL_HISTORY_CHARACTER_LIMIT
    )
  }

  const compacted = ordered.slice(
    0,
    -MODEL_RECENT_MESSAGE_COUNT_AFTER_COMPACTION
  )
  const recent = ordered.slice(-MODEL_RECENT_MESSAGE_COUNT_AFTER_COMPACTION)
  const throughSequence = compacted.at(-1)?.sequence
  if (!throughSequence) return recent.map(toCanonicalMessage)
  const summary =
    compacted.map(compactedMessageLine).join("\n").slice(0, 50_000) ||
    "Earlier messages contained only structured activity."
  const summaryId = `summary_${input.threadId}_${throughSequence}`.slice(0, 128)
  await tx
    .insert(agentThreadContextSummaries)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      threadId: input.threadId,
      throughSequence,
      summary,
      estimatedTokenCount: Math.max(1, Math.ceil(summary.length / 4)),
      model: "qwen/qwen3.6-flash",
    })
    .onConflictDoNothing()
  return [
    {
      id: summaryId,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `Earlier conversation summary (through message ${throughSequence}):\n${summary}`,
        },
      ],
    },
    ...recent.map(toCanonicalMessage),
  ]
}

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

const isRetryableDatabaseRace = (cause: unknown) => {
  const messages: string[] = []
  let current = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message)
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  const diagnostic = messages.join(" ")
  return (
    diagnostic.includes("SQLITE_BUSY") ||
    diagnostic.includes("SQLITE_LOCKED") ||
    diagnostic.includes("database is locked")
  )
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
          titleState: input.title === "New conversation" ? "untitled" : "agent",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      const thread = rows[0]
      if (!thread) throw new Error("Agent thread insert returned no row")
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

const issueConnectionTicketInTransaction = async (
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

const resolveAgentContextReferencesInTransaction = async (
  tx: AgentTransaction,
  input: {
    organizationId: string
    references: readonly AgentContextReferenceInput[]
  }
): Promise<AgentResolvedContextReference[]> => {
  const resolved: AgentResolvedContextReference[] = []
  for (const reference of input.references) {
    if (reference.kind === "issue") {
      // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
      const issue = await findIssueById(tx, {
        organizationId: input.organizationId,
        id: reference.id,
      })
      if (!issue) {
        throw publicErrors.notFound("Mentioned Issue not found", {
          resource: "issue",
        })
      }
      resolved.push({
        kind: "issue",
        id: issue.id,
        number: issue.number,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
      })
      continue
    }
    if (reference.kind === "file") {
      // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
      const rows = await tx
        .select({ id: files.id, filename: files.filename })
        .from(files)
        .where(
          and(
            eq(files.id, reference.id),
            eq(files.organizationId, input.organizationId),
            eq(files.status, "ready")
          )
        )
        .limit(1)
      const file = rows[0]
      if (!file) {
        throw publicErrors.notFound("Mentioned file not found", {
          resource: "file",
        })
      }
      resolved.push({ kind: "file", ...file })
      continue
    }
    if (reference.kind === "member") {
      // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
      const rows = await tx
        .select({ id: user.id, name: user.name, role: member.role })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.userId, reference.id)
          )
        )
        .limit(1)
      const mentionedMember = rows[0]
      if (!mentionedMember) {
        throw publicErrors.notFound("Mentioned member not found", {
          resource: "member",
        })
      }
      resolved.push({
        kind: "member",
        id: mentionedMember.id,
        name: mentionedMember.name,
        role: normalizeOrganizationRole(mentionedMember.role),
      })
      continue
    }

    if (reference.kind !== "current_page") {
      throw publicErrors.validation("Invalid context reference")
    }
    // Browser labelは信用せず、active organization slugとpage routeを再解決する。
    // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
    const organizationRows = await tx
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1)
    const active = organizationRows[0]
    const path = reference.path.split(/[?#]/u, 1)[0] ?? reference.path
    if (!active || !path.startsWith(`/organization/${active.slug}`)) {
      throw publicErrors.validation(
        "Current page is outside the active organization"
      )
    }
    const issueNumberMatch = /\/issues\/([1-9][0-9]*)$/u.exec(path)
    if (issueNumberMatch) {
      // oxlint-disable-next-line no-await-in-loop -- bounded references are resolved in request order.
      const issue = await findIssueByNumber(tx, {
        organizationId: input.organizationId,
        number: Number(issueNumberMatch[1]),
      })
      if (!issue) {
        throw publicErrors.notFound("Current page Issue not found", {
          resource: "issue",
        })
      }
      resolved.push({
        kind: "current_page",
        path,
        title: `Issue #${issue.number}: ${issue.title}`,
      })
    } else {
      resolved.push({ kind: "current_page", path, title: "Current page" })
    }
  }
  return resolved
}

const toCanonicalContextReference = (
  reference: AgentResolvedContextReference
): AgentCanonicalContextReference => {
  if (reference.kind === "issue") {
    return {
      kind: "issue",
      id: reference.id,
      label: `Issue #${reference.number}: ${reference.title}`,
    }
  }
  if (reference.kind === "file") {
    return { kind: "file", id: reference.id, label: reference.filename }
  }
  if (reference.kind === "member") {
    return { kind: "member", id: reference.id, label: reference.name }
  }
  return {
    kind: "current_page",
    path: reference.path,
    label: reference.title,
  }
}

const canonicalUserParts = (input: {
  assetIds: string[]
  contentSegments: AgentContentSegment[]
  resolvedReferences: AgentResolvedContextReference[]
}): AgentCanonicalMessage["parts"] => {
  let referenceIndex = 0
  const parts: AgentCanonicalMessage["parts"] = input.contentSegments.map(
    (segment) => {
      if (segment.type === "text") return segment
      const resolved = input.resolvedReferences[referenceIndex]
      referenceIndex += 1
      if (!resolved) throw publicErrors.validation("Invalid context reference")
      return {
        type: "data-context-reference" as const,
        data: toCanonicalContextReference(resolved),
      }
    }
  )
  if (input.assetIds.length > 0) {
    parts.push({
      type: "data-agent-assets",
      data: { assetIds: input.assetIds },
    })
  }
  return parts
}

export const prepareAgentChatForSession = async (
  db: Db,
  input: {
    assetIds: string[]
    contentSegments: AgentContentSegment[]
    messageId: string
    sessionId: string
    threadId: string
    timezone: string
    userId: string
    now?: Date
  }
) => {
  const credential = await createAgentToken()
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
      if (
        input.assetIds.length === 0 &&
        !input.contentSegments.some(
          (segment) =>
            segment.type === "context_reference" || segment.text.trim() !== ""
        )
      ) {
        throw publicErrors.validation("Agent message is empty")
      }
      const inputReferences = input.contentSegments.flatMap((segment) =>
        segment.type === "context_reference" ? [segment.reference] : []
      )
      const contextReferences =
        await resolveAgentContextReferencesInTransaction(tx, {
          organizationId: current.activeOrganizationId,
          references: inputReferences,
        })
      const parsedMessage = parseCanonicalMessage(
        {
          id: input.messageId,
          role: "user",
          parts: canonicalUserParts({
            assetIds: input.assetIds,
            contentSegments: input.contentSegments,
            resolvedReferences: contextReferences,
          }),
        },
        "user"
      )
      const content = { parts: parsedMessage.parts }
      const inserted = await tx
        .insert(agentMessages)
        .values({
          id: crypto.randomUUID(),
          organizationId: current.activeOrganizationId,
          threadId: thread.id,
          clientMessageId: parsedMessage.id,
          role: "user",
          content,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: agentMessages.id })
      if (!inserted[0]) {
        const existingRows = await tx
          .select({ content: agentMessages.content, role: agentMessages.role })
          .from(agentMessages)
          .where(
            and(
              eq(agentMessages.organizationId, current.activeOrganizationId),
              eq(agentMessages.threadId, thread.id),
              eq(agentMessages.clientMessageId, parsedMessage.id)
            )
          )
          .limit(1)
        const existing = existingRows[0]
        if (
          !existing ||
          existing.role !== "user" ||
          JSON.stringify(existing.content) !== JSON.stringify(content)
        ) {
          throw publicErrors.conflict("Agent message id is already in use", {
            reason: "idempotency_conflict",
            resource: "agent_message",
          })
        }
      }
      await tx
        .update(agentThreads)
        .set({ updatedAt: now })
        .where(
          and(
            eq(agentThreads.organizationId, current.activeOrganizationId),
            eq(agentThreads.id, thread.id)
          )
        )
      const connection = await issueConnectionTicketInTransaction(tx, {
        credential,
        current,
        now,
        sessionId: input.sessionId,
        threadId: thread.id,
        userId: input.userId,
      })
      const messages = await listModelContextInTransaction(tx, {
        organizationId: current.activeOrganizationId,
        threadId: thread.id,
      })
      return {
        ...connection,
        assetIds: input.assetIds,
        contextReferences,
        clientMessageId: parsedMessage.id,
        messages,
        threadId: thread.id,
        timezone: input.timezone,
        trigger: "user_message" as const,
      }
    })
  } catch (cause) {
    return preserveAgentError(cause, "prepareAgentChatForSession")
  }
}

const clientToolPartName = (
  part: AgentCanonicalMessage["parts"][number]
): string | undefined => {
  if (!part.type.startsWith("tool-")) return undefined
  const name = part.type.slice("tool-".length)
  return clientToolNames.has(name) ? name : undefined
}

const resultPart = (
  original: AgentCanonicalToolPart,
  result: AgentClientToolResult
): AgentCanonicalToolPart => ({
  type: original.type,
  toolCallId: original.toolCallId,
  state: result.state,
  ...(original.input === undefined ? {} : { input: original.input }),
  ...(result.state === "output-available"
    ? { output: result.output }
    : { errorText: result.errorText }),
})

const applyClientToolResults = (
  message: AgentCanonicalMessage & { role: "assistant" },
  results: AgentClientToolResult[]
): {
  changed: boolean
  message: AgentCanonicalMessage & { role: "assistant" }
} => {
  const byCallId = new Map(results.map((result) => [result.toolCallId, result]))
  let changed = false
  let matched = 0
  const parts = message.parts.map((part) => {
    const toolName = clientToolPartName(part)
    if (!toolName || !("toolCallId" in part)) return part
    const result = byCallId.get(part.toolCallId)
    if (!result) {
      if (part.state === "input-available") {
        throw publicErrors.validation("Missing client tool result")
      }
      return part
    }
    matched += 1
    if (result.toolName !== toolName) {
      throw publicErrors.validation("Client tool result does not match")
    }
    const next = resultPart(part, result)
    if (part.state === "input-available") {
      changed = true
      return next
    }
    if (
      (part.state !== "output-available" && part.state !== "output-error") ||
      JSON.stringify(part) !== JSON.stringify(next)
    ) {
      throw publicErrors.conflict("Client tool result changed", {
        reason: "idempotency_conflict",
        resource: "agent_message",
      })
    }
    return part
  })
  if (matched !== results.length) {
    throw publicErrors.validation("Unknown client tool result")
  }
  return {
    changed,
    message: parseCanonicalMessage({ ...message, parts }, "assistant"),
  }
}

export const prepareAgentClientToolContinuationForSession = async (
  db: Db,
  input: {
    assistantMessageId: string
    clientToolResults: AgentClientToolResult[]
    sessionId: string
    threadId: string
    timezone: string
    userId: string
    now?: Date
  }
) => {
  const sortedCallIds = input.clientToolResults
    .map((result) => result.toolCallId)
    .toSorted()
  const clientMessageId = `continuation_${(
    await hashAgentToken(
      `${input.assistantMessageId}\u0000${sortedCallIds.join("\u0000")}`
    )
  ).slice(0, 64)}`
  const credential = await createAgentToken()
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
      const rows = await tx
        .select()
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.organizationId, current.activeOrganizationId),
            eq(agentMessages.threadId, thread.id)
          )
        )
        .orderBy(desc(agentMessages.sequence))
        .limit(1)
      const row = rows[0]
      if (
        !row ||
        row.id !== input.assistantMessageId ||
        row.role !== "assistant"
      ) {
        throw publicErrors.conflict("Agent conversation changed", {
          resource: "agent_message",
        })
      }
      const canonical = parseCanonicalMessage(
        {
          id: row.id,
          role: row.role,
          parts: row.content.parts,
        },
        "assistant"
      )
      const applied = applyClientToolResults(canonical, input.clientToolResults)
      if (applied.changed) {
        const updated = await tx
          .update(agentMessages)
          .set({ content: { parts: applied.message.parts } })
          .where(
            and(
              eq(agentMessages.id, row.id),
              eq(agentMessages.organizationId, current.activeOrganizationId),
              eq(agentMessages.threadId, thread.id),
              eq(agentMessages.content, row.content)
            )
          )
          .returning({ id: agentMessages.id })
        if (!updated[0]) {
          throw publicErrors.conflict("Agent conversation changed", {
            resource: "agent_message",
          })
        }
      }
      await tx
        .update(agentThreads)
        .set({ updatedAt: now })
        .where(
          and(
            eq(agentThreads.organizationId, current.activeOrganizationId),
            eq(agentThreads.id, thread.id)
          )
        )
      const connection = await issueConnectionTicketInTransaction(tx, {
        credential,
        current,
        now,
        sessionId: input.sessionId,
        threadId: thread.id,
        userId: input.userId,
      })
      const messages = await listModelContextInTransaction(tx, {
        organizationId: current.activeOrganizationId,
        threadId: thread.id,
      })
      return {
        ...connection,
        assetIds: [],
        contextReferences: [],
        clientMessageId,
        messages,
        threadId: thread.id,
        timezone: input.timezone,
        trigger: "client_tool_result" as const,
      }
    })
  } catch (cause) {
    return preserveAgentError(
      cause,
      "prepareAgentClientToolContinuationForSession"
    )
  }
}

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

type StartAgentRunInput = {
  grant: string
  clientMessageId: string
  estimatedInputTokenCount?: number
  assetIds?: string[]
  trigger?: "user_message" | "client_tool_result"
  now?: Date
}

const startAgentRunWithRetry = async (
  db: Db,
  input: StartAgentRunInput,
  attempt = 0
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
          estimatedInputTokenCount: input.estimatedInputTokenCount ?? 0,
          status: "running",
          scope: "chat",
          attempt: 1,
          startedAt: now,
          expiresAt,
        })
        .onConflictDoNothing()
        .returning()
      let run = insertedRows[0]
      const inserted = run !== undefined
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
          input.trigger === "client_tool_result" ||
          !run ||
          run.organizationId !== context.organizationId ||
          run.sessionId !== context.sessionId ||
          run.userId !== context.userId ||
          run.contextEpoch !== context.contextEpoch ||
          run.scope !== "chat"
        ) {
          throw publicErrors.conflict("Agent message id is already in use", {
            reason: "idempotency_conflict",
            resource: "agent_run",
          })
        }

        const runningExpired =
          run.status === "running" && run.expiresAt.getTime() <= now.getTime()
        const retryableTerminal =
          run.status === "failed" ||
          run.status === "canceled" ||
          run.status === "expired"
        if (!runningExpired && !retryableTerminal) {
          throw publicErrors.conflict(
            "Agent run is already active or complete",
            {
              reason:
                run.status === "running" || run.status === "waiting_approval"
                  ? "run_in_progress"
                  : "idempotency_conflict",
              resource: "agent_run",
            }
          )
        }

        const unresolvedActions = await tx
          .select({ id: agentActions.id })
          .from(agentActions)
          .where(
            and(
              eq(agentActions.organizationId, context.organizationId),
              eq(agentActions.runId, run.id),
              inArray(agentActions.status, ["pending", "approved"])
            )
          )
          .limit(1)
        if (unresolvedActions[0]) {
          throw publicErrors.conflict(
            "Agent action must be resolved before retrying",
            {
              reason: "action_pending",
              resource: "agent_action",
            }
          )
        }

        const retryRows = await tx
          .update(agentRuns)
          .set({
            status: "running",
            attempt: sql`${agentRuns.attempt} + 1`,
            startedAt: now,
            expiresAt,
            webSearchUsedAt: run.webSearchUsedAt === null ? null : now,
            finishedAt: null,
          })
          .where(
            and(
              eq(agentRuns.id, run.id),
              eq(agentRuns.organizationId, context.organizationId),
              eq(agentRuns.attempt, run.attempt),
              eq(agentRuns.status, run.status),
              runningExpired ? lte(agentRuns.expiresAt, now) : undefined
            )
          )
          .returning()
        const retried = retryRows[0]
        if (!retried) {
          throw publicErrors.conflict("Agent run changed concurrently", {
            reason: "run_in_progress",
            resource: "agent_run",
          })
        }
        run = retried
        await reserveAgentModelRunInTransaction(tx, {
          attempt: run.attempt,
          expiresAt: run.expiresAt,
          now,
          organizationId: run.organizationId,
          runId: run.id,
          userId: run.userId,
        })
        await tx
          .update(agentGrants)
          .set({ revokedAt: now })
          .where(
            and(
              eq(agentGrants.organizationId, run.organizationId),
              eq(agentGrants.runId, run.id),
              isNull(agentGrants.revokedAt)
            )
          )
      }
      if (inserted) {
        await reserveAgentModelRunInTransaction(tx, {
          attempt: run.attempt,
          expiresAt: run.expiresAt,
          now,
          organizationId: run.organizationId,
          runId: run.id,
          userId: run.userId,
        })
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
      const consumedConnectionGrant = await tx
        .update(agentGrants)
        .set({ revokedAt: now })
        .where(
          and(
            eq(agentGrants.tokenHash, tokenHash),
            eq(agentGrants.kind, "connection"),
            isNull(agentGrants.revokedAt)
          )
        )
        .returning({ id: agentGrants.id })
      if (!consumedConnectionGrant[0]) {
        throw publicErrors.conflict("Agent connection grant was already used", {
          reason: "idempotency_conflict",
          resource: "agent_run",
        })
      }
      const threadRows = await tx
        .select({ titleState: agentThreads.titleState })
        .from(agentThreads)
        .where(
          and(
            eq(agentThreads.organizationId, run.organizationId),
            eq(agentThreads.id, run.threadId),
            eq(agentThreads.ownerUserId, run.userId),
            eq(agentThreads.status, "active")
          )
        )
        .limit(1)
      const thread = threadRows[0]
      if (!thread) {
        throw publicErrors.notFound("Agent thread not found", {
          resource: "agent_thread",
        })
      }
      return {
        runId: run.id,
        rootRunId: run.rootRunId,
        attempt: run.attempt,
        grant: runCredential.token,
        expiresAt: grantExpiresAt.toISOString(),
        shouldGenerateTitle: thread.titleState === "untitled",
      }
    })
  } catch (cause) {
    if (isRetryableDatabaseRace(cause)) {
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
        return startAgentRunWithRetry(db, input, attempt + 1)
      }
      throw new AppError({
        code: "rate_limited",
        publicMessage: "Agent run is temporarily busy. Try again",
        statusCode: 429,
        publicContext: {
          constraint: "active_model_run_transaction",
          reason: "concurrency_limit_exceeded",
          resource: "agent_run",
          retryAfter: 1,
        },
        privateContext: { module: "agent", operation: "startAgentRun" },
        cause,
      })
    }
    return preserveAgentError(cause, "startAgentRun")
  }
}

export const startAgentRun = (db: Db, input: StartAgentRunInput) =>
  startAgentRunWithRetry(db, input)

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

export const appendAgentRunMessages = async (
  db: Db,
  input: {
    grant: string
    messages: AgentCanonicalMessage[]
    now?: Date
  }
): Promise<{ appended: number }> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      let appended = 0
      const now = input.now ?? new Date()
      for (const unparsedMessage of input.messages) {
        const message = parseCanonicalMessage(unparsedMessage, "assistant")
        const content = { parts: message.parts }
        // oxlint-disable-next-line no-await-in-loop -- ordered idempotency checks keep each bounded assistant projection atomic.
        const inserted = await tx
          .insert(agentMessages)
          .values({
            id: message.id,
            organizationId: context.organizationId,
            threadId: context.threadId,
            role: "assistant",
            content,
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: agentMessages.id })
        if (inserted[0]) {
          appended += 1
          continue
        }
        // oxlint-disable-next-line no-await-in-loop -- conflict verification must follow this message's insert result.
        const existingRows = await tx
          .select({
            content: agentMessages.content,
            organizationId: agentMessages.organizationId,
            role: agentMessages.role,
            threadId: agentMessages.threadId,
          })
          .from(agentMessages)
          .where(eq(agentMessages.id, message.id))
          .limit(1)
        const existing = existingRows[0]
        if (
          !existing ||
          existing.organizationId !== context.organizationId ||
          existing.threadId !== context.threadId ||
          existing.role !== "assistant" ||
          JSON.stringify(existing.content) !== JSON.stringify(content)
        ) {
          throw publicErrors.conflict("Agent message id is already in use", {
            reason: "idempotency_conflict",
            resource: "agent_message",
          })
        }
      }
      await tx
        .update(agentThreads)
        .set({ updatedAt: now })
        .where(
          and(
            eq(agentThreads.organizationId, context.organizationId),
            eq(agentThreads.id, context.threadId)
          )
        )
      return { appended }
    })
  } catch (cause) {
    return preserveAgentError(cause, "appendAgentRunMessages")
  }
}

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

export const renameAgentThreadForRun = async (
  db: Db,
  input: { grant: string; title: string; now?: Date }
): Promise<{ threadId: string; title: string; renamed: boolean }> => {
  try {
    return await withRunGrant(db, input, async (tx, context) => {
      if (context.runScope !== "chat") {
        throw publicErrors.conflict("Only a chat run can rename its thread", {
          resource: "agent_thread",
        })
      }
      const now = input.now ?? new Date()
      const rows = await tx
        .update(agentThreads)
        .set({
          title: input.title,
          titleState: "agent",
          titleRevision: sql`${agentThreads.titleRevision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentThreads.organizationId, context.organizationId),
            eq(agentThreads.id, context.threadId),
            eq(agentThreads.ownerUserId, context.userId),
            eq(agentThreads.status, "active"),
            eq(agentThreads.titleState, "untitled")
          )
        )
        .returning({ id: agentThreads.id, title: agentThreads.title })
      const renamed = rows[0]
      if (renamed) {
        return { threadId: renamed.id, title: renamed.title, renamed: true }
      }
      const current = await requireOwnedThread(tx, {
        threadId: context.threadId,
        userId: context.userId,
        activeOrganizationId: context.organizationId,
      })
      return { threadId: current.id, title: current.title, renamed: false }
    })
  } catch (cause) {
    return preserveAgentError(cause, "renameAgentThreadForRun")
  }
}

export const renameAgentThreadForSession = async (
  db: Db,
  input: {
    expectedRevision: number
    sessionId: string
    threadId: string
    title: string
    userId: string
    now?: Date
  }
): Promise<AgentThreadDto> => {
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
      const rows = await tx
        .update(agentThreads)
        .set({
          title: input.title,
          titleState: "user",
          titleRevision: input.expectedRevision + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentThreads.organizationId, current.activeOrganizationId),
            eq(agentThreads.id, input.threadId),
            eq(agentThreads.ownerUserId, input.userId),
            eq(agentThreads.status, "active"),
            eq(agentThreads.titleRevision, input.expectedRevision)
          )
        )
        .returning()
      const renamed = rows[0]
      if (!renamed) {
        throw publicErrors.conflict("Agent thread title changed", {
          reason: "revision_conflict",
          resource: "agent_thread",
        })
      }
      const countRows = await tx
        .select({ value: sql<number>`count(*)` })
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.organizationId, current.activeOrganizationId),
            eq(agentMessages.threadId, input.threadId)
          )
        )
      return toThreadDto(renamed, Number(countRows[0]?.value ?? 0))
    })
  } catch (cause) {
    return preserveAgentError(cause, "renameAgentThreadForSession")
  }
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
