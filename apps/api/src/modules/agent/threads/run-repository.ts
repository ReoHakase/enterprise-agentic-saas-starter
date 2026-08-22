import type {
  AgentChatRun,
  AgentRunGrant,
} from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentActions,
  agentGrants,
  agentRuns,
  agentThreads,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm"

import { HttpError } from "../../../errors/http-error"
import { bindAgentAssetsToRunInTransaction } from "../../files/public"
import { createAgentToken, hashAgentToken } from "../crypto"
import { reserveAgentModelRunInTransaction } from "../usage/resource-limits"
import {
  createGrantInTransaction,
  validateGrantInTransaction,
} from "./auth-repository"
import { consumeAgentConnectionTicketInTransaction } from "./message-repository"
import {
  AGENT_RUN_TTL_MS,
  isRetryableDatabaseRace,
  type AgentTransaction,
  type ValidGrant,
} from "./repository-support"

export {
  cancelAgentRun,
  cancelAgentRunForSession,
  finishAgentRun,
} from "./run-transition-repository"

type AgentRunStartInput = {
  clientMessageId: string
  estimatedInputTokenCount?: number
  assetIds?: string[]
  trigger?: "user_message" | "client_tool_result"
  now?: Date
}

type StartAgentChatRunInput = AgentRunStartInput & {
  ticket: string
  threadId: string
}

const isCompatibleExistingRun = (
  input: Pick<AgentRunStartInput, "trigger">,
  run: typeof agentRuns.$inferSelect | undefined,
  context: ValidGrant
): run is typeof agentRuns.$inferSelect =>
  input.trigger !== "client_tool_result" &&
  run !== undefined &&
  run.organizationId === context.organizationId &&
  run.sessionId === context.sessionId &&
  run.userId === context.userId &&
  run.contextEpoch === context.contextEpoch &&
  run.scope === "chat" &&
  run.webSearchQueryHash === context.webSearchQueryHash

const createAgentRunInTransaction = async (
  tx: AgentTransaction,
  input: Omit<AgentRunStartInput, "now">,
  context: ValidGrant,
  runCredential: Awaited<ReturnType<typeof createAgentToken>>,
  now: Date
): Promise<AgentRunGrant> => {
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
      webSearchQueryHash: context.webSearchQueryHash,
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
    if (!isCompatibleExistingRun(input, run, context)) {
      throw new HttpError({ code: "conflict" })
    }

    const runningExpired =
      run.status === "running" && run.expiresAt.getTime() <= now.getTime()
    const retryableTerminal =
      run.status === "failed" ||
      run.status === "canceled" ||
      run.status === "expired"
    if (!runningExpired && !retryableTerminal) {
      throw new HttpError({ code: "conflict" })
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
      throw new HttpError({ code: "conflict" })
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
      throw new HttpError({ code: "conflict" })
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
    webSearchQueryHash: run.webSearchQueryHash,
    now,
    expiresAt: run.expiresAt,
  })
  const threadRows = await tx
    .select({ id: agentThreads.id })
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
    throw new HttpError({ code: "not_found" })
  }
  return {
    runId: run.id,
    rootRunId: run.rootRunId,
    attempt: run.attempt,
    grant: runCredential.token,
    expiresAt: grantExpiresAt.toISOString(),
    shouldGenerateTitle: input.trigger !== "client_tool_result",
  }
}

const startAgentChatRunWithRetry = async (
  db: Db,
  input: StartAgentChatRunInput,
  attempt = 0
): Promise<AgentChatRun> => {
  const [ticketHash, runCredential] = await Promise.all([
    hashAgentToken(input.ticket),
    createAgentToken(),
  ])
  try {
    return await db.transaction(async (tx) => {
      const now = input.now ?? new Date()
      const connection = await consumeAgentConnectionTicketInTransaction(tx, {
        ticketHash,
        threadId: input.threadId,
        now,
      })
      const run = await createAgentRunInTransaction(
        tx,
        input,
        connection.context,
        runCredential,
        now
      )
      return {
        memoryResourceId: connection.memoryResourceId,
        user: connection.account,
        organization: connection.organization,
        thread: connection.thread,
        run,
      }
    })
  } catch (cause) {
    if (isRetryableDatabaseRace(cause)) {
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt))
        return startAgentChatRunWithRetry(db, input, attempt + 1)
      }
      throw new HttpError({
        code: "rate_limited",
        cause,
        retryAfter: 1,
      })
    }
    throw cause
  }
}

export const startAgentChatRun = (db: Db, input: StartAgentChatRunInput) =>
  startAgentChatRunWithRetry(db, input)

export const assertAgentRunLive = (
  db: Db,
  input: { grant: string; now?: Date }
) => withRunGrant(db, input, async () => ({ live: true as const }))

export const withRunGrant = async <T>(
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
