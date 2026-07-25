import { db } from "@enterprise-agentic-saas/db"
import { assertLocalDatabaseUrl } from "@enterprise-agentic-saas/db/local-development"
import {
  agentActions,
  agentConnectionTickets,
  agentGrants,
  agentMessages,
  agentRuns,
  agentSessionContexts,
  agentThreads,
  auditLogs,
  issues,
  session,
} from "@enterprise-agentic-saas/db/schema"
import { and, count, eq, inArray } from "drizzle-orm"

import { hashAgentToken } from "../src/modules/agent/crypto"
import { validateGrantInTransaction } from "../src/modules/agent/threads/auth-repository"
import { consumeAgentConnectionTicket } from "../src/modules/agent/threads/message-repository"
import type { AgentTransaction } from "../src/modules/agent/threads/repository-support"

const requiredEnvironment = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value || /[\r\n]/u.test(value)) {
    throw new Error(`Agent eval scope probe requires ${name}`)
  }
  return value
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("Agent eval scope probe requires NODE_ENV=test")
}
assertLocalDatabaseUrl(requiredEnvironment("TURSO_DATABASE_URL"))

const namespace = requiredEnvironment("AGENT_EVAL_NAMESPACE")

const hashNamespace = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

const countRows = async (
  table:
    | typeof agentActions
    | typeof agentMessages
    | typeof agentRuns
    | typeof auditLogs
    | typeof issues
) => {
  const rows = await db.select({ value: count() }).from(table)
  return rows[0]?.value ?? 0
}

const sideEffectSnapshot = async () => ({
  actions: await countRows(agentActions),
  audits: await countRows(auditLogs),
  connectionTickets: await db
    .select({
      consumedAt: agentConnectionTickets.consumedAt,
      id: agentConnectionTickets.id,
      revokedAt: agentConnectionTickets.revokedAt,
    })
    .from(agentConnectionTickets)
    .orderBy(agentConnectionTickets.id),
  grants: await db
    .select({
      contextEpoch: agentGrants.contextEpoch,
      id: agentGrants.id,
      organizationId: agentGrants.organizationId,
      runId: agentGrants.runId,
      sessionId: agentGrants.sessionId,
      threadId: agentGrants.threadId,
      userId: agentGrants.userId,
    })
    .from(agentGrants)
    .orderBy(agentGrants.id),
  issues: await countRows(issues),
  messages: await countRows(agentMessages),
  runs: await countRows(agentRuns),
  sessionContexts: await db
    .select({
      contextEpoch: agentSessionContexts.contextEpoch,
      sessionId: agentSessionContexts.sessionId,
      userId: agentSessionContexts.userId,
    })
    .from(agentSessionContexts)
    .orderBy(agentSessionContexts.sessionId),
  sessions: await db
    .select({
      activeOrganizationId: session.activeOrganizationId,
      id: session.id,
      userId: session.userId,
    })
    .from(session)
    .orderBy(session.id),
  threads: await db
    .select({
      id: agentThreads.id,
      organizationId: agentThreads.organizationId,
      ownerUserId: agentThreads.ownerUserId,
      status: agentThreads.status,
    })
    .from(agentThreads)
    .orderBy(agentThreads.id),
})

const rejectsGrant = async (
  tx: AgentTransaction,
  tokenHash: string,
  now: Date
) => {
  try {
    await validateGrantInTransaction(tx, {
      allowTerminalRun: true,
      kind: "run",
      now,
      tokenHash,
    })
    return false
  } catch {
    return true
  }
}

const mainScope = async (organizationId: string) => {
  const runs = await db
    .select({
      contextEpoch: agentRuns.contextEpoch,
      id: agentRuns.id,
      sessionId: agentRuns.sessionId,
      threadId: agentRuns.threadId,
      userId: agentRuns.userId,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.organizationId, organizationId),
        eq(agentRuns.scope, "chat")
      )
    )
    .limit(1)
  const run = runs[0]
  if (!run) throw new Error("Agent eval scope probe could not find the run")
  const grants = await db
    .select({
      expiresAt: agentGrants.expiresAt,
      id: agentGrants.id,
      tokenHash: agentGrants.tokenHash,
    })
    .from(agentGrants)
    .where(and(eq(agentGrants.kind, "run"), eq(agentGrants.runId, run.id)))
    .limit(1)
  const grant = grants[0]
  if (!grant) throw new Error("Agent eval scope probe could not find the grant")
  return { grant, run }
}

const wrongOrganizationProbe = async (
  scope: Awaited<ReturnType<typeof mainScope>>,
  decoyOrganizationId: string,
  organizationId: string,
  now: Date
) =>
  db.transaction(async (tx) => {
    await tx
      .update(session)
      .set({ activeOrganizationId: decoyOrganizationId })
      .where(eq(session.id, scope.run.sessionId))
    const rejected = await rejectsGrant(tx, scope.grant.tokenHash, now)
    await tx
      .update(session)
      .set({ activeOrganizationId: organizationId })
      .where(eq(session.id, scope.run.sessionId))
    return rejected
  })

const wrongThreadProbe = async (
  scope: Awaited<ReturnType<typeof mainScope>>,
  organizationId: string,
  now: Date
) =>
  db.transaction(async (tx) => {
    const threadId = `eval_probe_thread_${namespace.slice(-48)}`.slice(0, 128)
    await tx.insert(agentThreads).values({
      id: threadId,
      organizationId,
      ownerUserId: scope.run.userId,
      title: "Agent eval scope probe",
    })
    await tx
      .update(agentGrants)
      .set({ threadId })
      .where(eq(agentGrants.id, scope.grant.id))
    const rejected = await rejectsGrant(tx, scope.grant.tokenHash, now)
    await tx
      .update(agentGrants)
      .set({ threadId: scope.run.threadId })
      .where(eq(agentGrants.id, scope.grant.id))
    await tx.delete(agentThreads).where(eq(agentThreads.id, threadId))
    return rejected
  })

const staleEpochProbe = async (
  scope: Awaited<ReturnType<typeof mainScope>>,
  now: Date
) =>
  db.transaction(async (tx) => {
    await tx
      .update(agentSessionContexts)
      .set({ contextEpoch: scope.run.contextEpoch + 1 })
      .where(eq(agentSessionContexts.sessionId, scope.run.sessionId))
    const rejected = await rejectsGrant(tx, scope.grant.tokenHash, now)
    await tx
      .update(agentSessionContexts)
      .set({ contextEpoch: scope.run.contextEpoch })
      .where(eq(agentSessionContexts.sessionId, scope.run.sessionId))
    return rejected
  })

const connectionReplayProbe = async (
  scope: Awaited<ReturnType<typeof mainScope>>,
  organizationId: string
) => {
  const token = `agent-eval-replay-${await hashNamespace(namespace)}`
  const ticketId = `eval_probe_ticket_${namespace.slice(-48)}`.slice(0, 128)
  const tokenHash = await hashAgentToken(token)
  const grantIdsBefore = new Set(
    (await db.select({ id: agentGrants.id }).from(agentGrants)).map(
      (row) => row.id
    )
  )
  const now = new Date()
  await db.insert(agentConnectionTickets).values({
    contextEpoch: scope.run.contextEpoch,
    expiresAt: new Date(now.getTime() + 60_000),
    id: ticketId,
    issuedAt: now,
    organizationId,
    sessionId: scope.run.sessionId,
    threadId: scope.run.threadId,
    tokenHash,
    userId: scope.run.userId,
  })
  let rejected = false
  try {
    await consumeAgentConnectionTicket(db, {
      now,
      threadId: scope.run.threadId,
      ticket: token,
    })
    try {
      await consumeAgentConnectionTicket(db, {
        now,
        threadId: scope.run.threadId,
        ticket: token,
      })
    } catch {
      rejected = true
    }
  } finally {
    const createdGrantIds = (
      await db.select({ id: agentGrants.id }).from(agentGrants)
    )
      .map((row) => row.id)
      .filter((id) => !grantIdsBefore.has(id))
    if (createdGrantIds.length > 0) {
      await db
        .delete(agentGrants)
        .where(inArray(agentGrants.id, createdGrantIds))
    }
    await db
      .delete(agentConnectionTickets)
      .where(eq(agentConnectionTickets.id, ticketId))
  }
  return rejected
}

const run = async () => {
  const hash = await hashNamespace(namespace)
  const suffix = hash.slice(0, 24)
  const organizationId = `eval_org_${suffix}`
  const decoyOrganizationId = `eval_decoy_org_${suffix}`
  const scope = await mainScope(organizationId)
  const probeNow = new Date()
  const before = await sideEffectSnapshot()
  const probes = {
    baselineGrantAccepted: await db.transaction(
      async (tx) => !(await rejectsGrant(tx, scope.grant.tokenHash, probeNow))
    ),
    connectionReplayRejected: await connectionReplayProbe(
      scope,
      organizationId
    ),
    expiredGrantRejected: await db.transaction((tx) =>
      rejectsGrant(
        tx,
        scope.grant.tokenHash,
        new Date(scope.grant.expiresAt.getTime() + 1)
      )
    ),
    staleEpochRejected: await staleEpochProbe(scope, probeNow),
    wrongOrganizationRejected: await wrongOrganizationProbe(
      scope,
      decoyOrganizationId,
      organizationId,
      probeNow
    ),
    wrongThreadRejected: await wrongThreadProbe(
      scope,
      organizationId,
      probeNow
    ),
  }
  const after = await sideEffectSnapshot()
  console.log(
    JSON.stringify({
      ...probes,
      sideEffectsUnchanged: JSON.stringify(after) === JSON.stringify(before),
    })
  )
}

await run()
