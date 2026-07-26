import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentActions,
  agentGrants,
  agentMessages,
  agentRuns,
  agentThreads,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm"

import type {
  AgentCanonicalMessage,
  AgentRunGrant,
  AgentRunResult,
} from "../../../agent-client"
import { AppError, publicErrors } from "../../../errors/app-error"
import { bindAgentAssetsToRunInTransaction } from "../../files/public"
import { createAgentToken, hashAgentToken } from "../crypto"
import { reserveAgentModelRunInTransaction } from "../usage/resource-limits"
import {
  createGrantInTransaction,
  validateGrantInTransaction,
} from "./auth-repository"
import {
  AGENT_RUN_TTL_MS,
  isRetryableDatabaseRace,
  parseCanonicalMessage,
  preserveAgentError,
  type AgentTransaction,
  type ValidGrant,
} from "./repository-support"

export type StartAgentRunInput = {
  grant: string
  clientMessageId: string
  estimatedInputTokenCount?: number
  assetIds?: string[]
  trigger?: "user_message" | "client_tool_result"
  now?: Date
}

const isCompatibleExistingRun = (
  input: StartAgentRunInput,
  run: typeof agentRuns.$inferSelect | undefined,
  context: ValidGrant
): run is typeof agentRuns.$inferSelect =>
  input.trigger !== "client_tool_result" &&
  run !== undefined &&
  run.organizationId === context.organizationId &&
  run.sessionId === context.sessionId &&
  run.userId === context.userId &&
  run.contextEpoch === context.contextEpoch &&
  run.scope === "chat"

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
        if (!isCompatibleExistingRun(input, run, context)) {
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
