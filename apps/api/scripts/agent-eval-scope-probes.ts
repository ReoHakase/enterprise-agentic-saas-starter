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
const scopeProbeFailureStages = [
  "baseline",
  "connection_replay",
  "expired_grant",
  "setup",
  "side_effect_snapshot",
  "stale_epoch",
  "wrong_organization",
  "wrong_thread",
] as const
type ScopeProbeFailureStage = (typeof scopeProbeFailureStages)[number]

class ScopeProbeFailure extends Error {
  constructor(readonly stage: ScopeProbeFailureStage) {
    super("Agent eval scope probe failed")
  }
}

const runProbe = async <Result>(
  stage: ScopeProbeFailureStage,
  operation: () => Promise<Result>
): Promise<Result> => {
  try {
    return await operation()
  } catch {
    throw new ScopeProbeFailure(stage)
  }
}

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

class RollbackProbeResult extends Error {
  constructor(readonly rejected: boolean) {
    super("Agent eval rollback probe completed")
  }
}

const runRollbackProbe = async (
  operation: (tx: AgentTransaction) => Promise<boolean>
): Promise<boolean> => {
  try {
    await db.transaction(async (tx) => {
      throw new RollbackProbeResult(await operation(tx))
    })
    throw new Error("Agent eval rollback probe committed")
  } catch (cause) {
    if (cause instanceof RollbackProbeResult) return cause.rejected
    throw cause
  }
}

const mainScope = async (organizationId: string) => {
  const runs = await db
    .select({
      contextEpoch: agentRuns.contextEpoch,
      expiresAt: agentRuns.expiresAt,
      id: agentRuns.id,
      organizationId: agentRuns.organizationId,
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
  const issuedAt = new Date()
  const expiresAt = new Date(
    Math.min(run.expiresAt.getTime(), issuedAt.getTime() + 60_000)
  )
  const grant = {
    expiresAt,
    id: `eval_probe_grant_${namespace.slice(-48)}`.slice(0, 128),
    tokenHash: await hashAgentToken(
      `agent-eval-scope-${await hashNamespace(namespace)}`
    ),
  }
  await db.insert(agentGrants).values({
    ...grant,
    contextEpoch: run.contextEpoch,
    issuedAt,
    kind: "run",
    organizationId: run.organizationId,
    runId: run.id,
    sessionId: run.sessionId,
    threadId: run.threadId,
    userId: run.userId,
  })
  return { grant, run }
}

const wrongOrganizationProbe = async (
  scope: Awaited<ReturnType<typeof mainScope>>,
  decoyOrganizationId: string,
  now: Date
) =>
  runRollbackProbe(async (tx) => {
    await tx
      .update(session)
      .set({ activeOrganizationId: decoyOrganizationId })
      .where(eq(session.id, scope.run.sessionId))
    return rejectsGrant(tx, scope.grant.tokenHash, now)
  })

const wrongThreadProbe = async (
  scope: Awaited<ReturnType<typeof mainScope>>,
  organizationId: string,
  now: Date
) =>
  runRollbackProbe(async (tx) => {
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
    return rejectsGrant(tx, scope.grant.tokenHash, now)
  })

const staleEpochProbe = async (
  scope: Awaited<ReturnType<typeof mainScope>>,
  now: Date
) =>
  runRollbackProbe(async (tx) => {
    await tx
      .update(agentSessionContexts)
      .set({ contextEpoch: scope.run.contextEpoch + 1 })
      .where(eq(agentSessionContexts.sessionId, scope.run.sessionId))
    return rejectsGrant(tx, scope.grant.tokenHash, now)
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
  const scope = await runProbe("setup", () => mainScope(organizationId))
  try {
    const probeNow = new Date()
    const before = await runProbe("side_effect_snapshot", sideEffectSnapshot)
    const probes = {
      baselineGrantAccepted: await runProbe("baseline", () =>
        db.transaction(
          async (tx) =>
            !(await rejectsGrant(tx, scope.grant.tokenHash, probeNow))
        )
      ),
      connectionReplayRejected: await runProbe("connection_replay", () =>
        connectionReplayProbe(scope, organizationId)
      ),
      expiredGrantRejected: await runProbe("expired_grant", () =>
        db.transaction((tx) =>
          rejectsGrant(
            tx,
            scope.grant.tokenHash,
            new Date(scope.grant.expiresAt.getTime() + 1)
          )
        )
      ),
      staleEpochRejected: await runProbe("stale_epoch", () =>
        staleEpochProbe(scope, probeNow)
      ),
      wrongOrganizationRejected: await runProbe("wrong_organization", () =>
        wrongOrganizationProbe(scope, decoyOrganizationId, probeNow)
      ),
      wrongThreadRejected: await runProbe("wrong_thread", () =>
        wrongThreadProbe(scope, organizationId, probeNow)
      ),
    }
    const after = await runProbe("side_effect_snapshot", sideEffectSnapshot)
    console.log(
      JSON.stringify({
        ...probes,
        sideEffectsUnchanged: JSON.stringify(after) === JSON.stringify(before),
      })
    )
  } finally {
    await db.delete(agentGrants).where(eq(agentGrants.id, scope.grant.id))
  }
}

try {
  await run()
} catch (cause) {
  const failureStage =
    cause instanceof ScopeProbeFailure ? cause.stage : "setup"
  console.log(JSON.stringify({ failureStage }))
}
