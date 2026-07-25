import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentRuns,
  agentResourceUsageBuckets,
  agentResourceUsageOperations,
  type AgentResourceUsageKind,
} from "@enterprise-agentic-saas/db/schema"
import { and, asc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm"

import { AppError } from "../../../errors/app-error"

export type AgentResourceUsageTransaction = Parameters<
  Parameters<Db["transaction"]>[0]
>[0]

export const AGENT_USAGE_HOUR_MS = 60 * 60 * 1000
export const AGENT_USAGE_DAY_MS = 24 * AGENT_USAGE_HOUR_MS
const AGENT_RESOURCE_USAGE_RETENTION_GRACE_MS = AGENT_USAGE_DAY_MS
const AGENT_RESOURCE_USAGE_PURGE_BATCH_SIZE = 100

// 初期運用はcost runawayを避けるため、課金対象をuserの短期窓とorgの
// 日次窓の両方で予約する。plan別quotaを導入するまではこの保守値を正本にする。
/** @internal */
export const AGENT_MODEL_RUN_USER_HOURLY_LIMIT = 20
/** @internal */
export const AGENT_MODEL_RUN_ORGANIZATION_DAILY_LIMIT = 500
/** @internal */
export const AGENT_WEB_SEARCH_USER_HOURLY_LIMIT = 10
const AGENT_WEB_SEARCH_ORGANIZATION_DAILY_LIMIT = 100
const AGENT_MODEL_RUN_ACTIVE_USER_LIMIT = 1
const AGENT_MODEL_RUN_ACTIVE_ORGANIZATION_LIMIT = 10

/**
 * 完了windowはretry/idempotencyの短いgraceだけ保持し、bucket削除のFK cascadeで
 * operation ledgerも同じtransactionからpurgeする。
 */
export const purgeExpiredAgentResourceUsage = async (
  db: Db,
  input: { limit?: number; now?: Date; retentionGraceMs?: number } = {}
) => {
  const now = input.now ?? new Date()
  const retentionGraceMs =
    input.retentionGraceMs ?? AGENT_RESOURCE_USAGE_RETENTION_GRACE_MS
  const limit = input.limit ?? AGENT_RESOURCE_USAGE_PURGE_BATCH_SIZE
  if (
    !Number.isSafeInteger(retentionGraceMs) ||
    retentionGraceMs < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 500
  ) {
    throw new Error("Invalid agent resource usage purge options")
  }
  const cutoff = new Date(now.getTime() - retentionGraceMs)
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: agentResourceUsageBuckets.id })
      .from(agentResourceUsageBuckets)
      .where(lte(agentResourceUsageBuckets.windowEnd, cutoff))
      .orderBy(asc(agentResourceUsageBuckets.windowEnd))
      .limit(limit)
    const bucketIds = candidates.map(({ id }) => id)
    if (bucketIds.length === 0) {
      return { bucketsDeleted: 0, operationsDeleted: 0 }
    }
    const operationRows = await tx
      .select({ count: sql<number>`count(*)` })
      .from(agentResourceUsageOperations)
      .where(inArray(agentResourceUsageOperations.bucketId, bucketIds))
    const deletedBuckets = await tx
      .delete(agentResourceUsageBuckets)
      .where(inArray(agentResourceUsageBuckets.id, bucketIds))
      .returning({ id: agentResourceUsageBuckets.id })
    return {
      bucketsDeleted: deletedBuckets.length,
      operationsDeleted: Number(operationRows[0]?.count ?? 0),
    }
  })
}

const diagnosticText = (cause: unknown) => {
  const values: string[] = []
  let current = cause
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) values.push(current.message)
    if (typeof current !== "object") break
    current = Reflect.get(current, "cause")
  }
  return values.join(" ")
}

const limitExceeded = (input: { now: Date; windowEnd: Date }) =>
  new AppError({
    code: "rate_limited",
    publicMessage: "Agent resource limit exceeded. Try again later",
    publicContext: {
      reason: "rate_limit_exceeded",
      retryAfter: Math.max(
        1,
        Math.ceil((input.windowEnd.getTime() - input.now.getTime()) / 1000)
      ),
    },
    privateContext: { module: "agent-resource-usage" },
  })

const concurrencyLimitExceeded = (input: {
  constraint: "active_model_runs_organization" | "active_model_runs_user"
  now: Date
  retryAt: Date
}) =>
  new AppError({
    code: "rate_limited",
    publicMessage: "Too many agent runs are active. Try again later",
    publicContext: {
      constraint: input.constraint,
      reason: "concurrency_limit_exceeded",
      resource: "agent_run",
      retryAfter: Math.max(
        1,
        Math.ceil((input.retryAt.getTime() - input.now.getTime()) / 1000)
      ),
    },
    privateContext: { module: "agent-resource-usage" },
  })

const usageBucketId = async (input: {
  kind: AgentResourceUsageKind
  organizationId: string
  userId: string | null
  windowStart: Date
}) => {
  const scope = [
    input.organizationId,
    input.userId ?? "organization",
    input.kind,
    input.windowStart.getTime(),
  ].join("\u0000")
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(scope)
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

/**
 * 同じoperation IDは同じwindow/scopeで一度だけ加算する。
 * 2つ以上のscopeを消費するときは呼出側の同一transactionに閉じる。
 */
export const consumeAgentResourceLimitInTransaction = async (
  tx: AgentResourceUsageTransaction,
  input: {
    kind: AgentResourceUsageKind
    limitCount: number
    now: Date
    operationId: string
    organizationId: string
    userId: string | null
    windowEnd: Date
    windowStart: Date
  }
) => {
  if (
    input.operationId.length < 1 ||
    input.operationId.length > 160 ||
    input.limitCount < 0 ||
    !Number.isSafeInteger(input.limitCount) ||
    input.windowEnd.getTime() <= input.windowStart.getTime()
  ) {
    throw new Error("Invalid agent resource usage reservation")
  }
  const bucketId = await usageBucketId(input)
  await tx
    .insert(agentResourceUsageBuckets)
    .values({
      id: bucketId,
      organizationId: input.organizationId,
      userId: input.userId,
      kind: input.kind,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      count: 0,
      limitCount: input.limitCount,
      updatedAt: input.now,
    })
    .onConflictDoNothing()

  const bucketRows = await tx
    .select({
      id: agentResourceUsageBuckets.id,
      limitCount: agentResourceUsageBuckets.limitCount,
      windowEnd: agentResourceUsageBuckets.windowEnd,
    })
    .from(agentResourceUsageBuckets)
    .where(
      and(
        eq(agentResourceUsageBuckets.organizationId, input.organizationId),
        eq(agentResourceUsageBuckets.kind, input.kind),
        eq(agentResourceUsageBuckets.windowStart, input.windowStart),
        input.userId === null
          ? isNull(agentResourceUsageBuckets.userId)
          : eq(agentResourceUsageBuckets.userId, input.userId)
      )
    )
    .limit(1)
  const bucket = bucketRows[0]
  if (
    !bucket ||
    bucket.limitCount !== input.limitCount ||
    bucket.windowEnd.getTime() !== input.windowEnd.getTime()
  ) {
    throw new Error("Agent resource usage bucket configuration changed")
  }

  try {
    const inserted = await tx
      .insert(agentResourceUsageOperations)
      .values({
        operationId: input.operationId,
        organizationId: input.organizationId,
        bucketId: bucket.id,
        delta: 1,
        createdAt: input.now,
      })
      .onConflictDoNothing()
      .returning({ operationId: agentResourceUsageOperations.operationId })
    return { consumed: Boolean(inserted[0]) }
  } catch (cause) {
    if (
      diagnosticText(cause).includes("agent_resource_usage_buckets_count_check")
    ) {
      throw limitExceeded(input)
    }
    throw cause
  }
}

export const utcUsageWindow = (
  now: Date,
  durationMs: typeof AGENT_USAGE_HOUR_MS | typeof AGENT_USAGE_DAY_MS
) => {
  const start = Math.floor(now.getTime() / durationMs) * durationMs
  return {
    windowStart: new Date(start),
    windowEnd: new Date(start + durationMs),
  }
}

export const hashedAgentUsageOperationId = async (
  namespace: string,
  ...parts: string[]
) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(parts.join("\u0000"))
  )
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  return `${namespace}:${hex}`
}

type ModelRunConcurrencyInput = {
  expiresAt: Date
  now: Date
  organizationId: string
  runId: string
  userId: string
}

type ModelRunReservationInput = ModelRunConcurrencyInput & {
  attempt: number
}

const assertAgentModelRunConcurrencyInTransaction = async (
  tx: AgentResourceUsageTransaction,
  input: ModelRunConcurrencyInput
) => {
  const activeRuns = await tx
    .select({
      expiresAt: agentRuns.expiresAt,
      id: agentRuns.id,
      userId: agentRuns.userId,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.organizationId, input.organizationId),
        eq(agentRuns.scope, "chat"),
        eq(agentRuns.status, "running"),
        gt(agentRuns.expiresAt, input.now)
      )
    )

  const retryAt = (runs: typeof activeRuns) =>
    runs
      .filter(({ id }) => id !== input.runId)
      .reduce<Date | null>(
        (earliest, run) =>
          earliest === null || run.expiresAt < earliest
            ? run.expiresAt
            : earliest,
        null
      ) ?? input.expiresAt

  const activeUserRuns = activeRuns.filter(
    ({ userId }) => userId === input.userId
  )
  if (activeUserRuns.length > AGENT_MODEL_RUN_ACTIVE_USER_LIMIT) {
    throw concurrencyLimitExceeded({
      constraint: "active_model_runs_user",
      now: input.now,
      retryAt: retryAt(activeUserRuns),
    })
  }
  if (activeRuns.length > AGENT_MODEL_RUN_ACTIVE_ORGANIZATION_LIMIT) {
    throw concurrencyLimitExceeded({
      constraint: "active_model_runs_organization",
      now: input.now,
      retryAt: retryAt(activeRuns),
    })
  }
}

const assertMatchingReservationResult = (input: {
  organizationConsumed: boolean
  userConsumed: boolean
}) => {
  if (input.organizationConsumed !== input.userConsumed) {
    throw new Error("Agent resource usage reservation ledger is inconsistent")
  }
  return { reused: !input.userConsumed }
}

/**
 * chat run attemptをrunningへ確定した同じtransactionから呼ぶ。新規insertと
 * CAS retryのどちらも、active runと2つのquota bucketをattempt単位で予約する。
 */
export const reserveAgentModelRunInTransaction = async (
  tx: AgentResourceUsageTransaction,
  input: ModelRunReservationInput
) => {
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new Error("Invalid Agent model run attempt")
  }
  await assertAgentModelRunConcurrencyInTransaction(tx, input)
  const operationId = await hashedAgentUsageOperationId(
    "model-run",
    input.organizationId,
    input.userId,
    input.runId,
    String(input.attempt)
  )
  const organizationWindow = utcUsageWindow(input.now, AGENT_USAGE_DAY_MS)
  const userWindow = utcUsageWindow(input.now, AGENT_USAGE_HOUR_MS)
  const organization = await consumeAgentResourceLimitInTransaction(tx, {
    kind: "model_run",
    limitCount: AGENT_MODEL_RUN_ORGANIZATION_DAILY_LIMIT,
    now: input.now,
    operationId,
    organizationId: input.organizationId,
    userId: null,
    ...organizationWindow,
  })
  const user = await consumeAgentResourceLimitInTransaction(tx, {
    kind: "model_run",
    limitCount: AGENT_MODEL_RUN_USER_HOURLY_LIMIT,
    now: input.now,
    operationId,
    organizationId: input.organizationId,
    userId: input.userId,
    ...userWindow,
  })
  return assertMatchingReservationResult({
    organizationConsumed: organization.consumed,
    userConsumed: user.consumed,
  })
}

/**
 * provider call前に呼び、検索の課金枠とroot runのsecurity markerを同時に固定する。
 * operationIdはtool call由来でもraw値をledgerへ保存しない。
 */
export const reserveAgentWebSearchInTransaction = async (
  tx: AgentResourceUsageTransaction,
  input: {
    now: Date
    operationId: string
    organizationId: string
    runId: string
    threadId: string
    userId: string
  }
) => {
  const operationId = await hashedAgentUsageOperationId(
    "web-search",
    input.organizationId,
    input.userId,
    input.runId,
    input.operationId
  )
  const organizationWindow = utcUsageWindow(input.now, AGENT_USAGE_DAY_MS)
  const userWindow = utcUsageWindow(input.now, AGENT_USAGE_HOUR_MS)
  const organization = await consumeAgentResourceLimitInTransaction(tx, {
    kind: "web_search",
    limitCount: AGENT_WEB_SEARCH_ORGANIZATION_DAILY_LIMIT,
    now: input.now,
    operationId,
    organizationId: input.organizationId,
    userId: null,
    ...organizationWindow,
  })
  const user = await consumeAgentResourceLimitInTransaction(tx, {
    kind: "web_search",
    limitCount: AGENT_WEB_SEARCH_USER_HOURLY_LIMIT,
    now: input.now,
    operationId,
    organizationId: input.organizationId,
    userId: input.userId,
    ...userWindow,
  })
  const markedRuns = await tx
    .update(agentRuns)
    .set({
      webSearchUsedAt: sql`coalesce(${agentRuns.webSearchUsedAt}, ${input.now})`,
    })
    .where(
      and(
        eq(agentRuns.id, input.runId),
        eq(agentRuns.organizationId, input.organizationId),
        eq(agentRuns.threadId, input.threadId),
        eq(agentRuns.userId, input.userId),
        eq(agentRuns.scope, "chat"),
        eq(agentRuns.status, "running"),
        gt(agentRuns.expiresAt, input.now)
      )
    )
    .returning({ id: agentRuns.id })
  if (!markedRuns[0]) {
    throw new Error("Agent web search run is no longer active")
  }
  return assertMatchingReservationResult({
    organizationConsumed: organization.consumed,
    userConsumed: user.consumed,
  })
}
