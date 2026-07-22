import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentResourceUsageBuckets,
  agentResourceUsageOperations,
} from "@enterprise-agentic-saas/db/schema"
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm"

import { AppError } from "../../errors/app-error"

export type AgentResourceUsageTransaction = Parameters<
  Parameters<Db["transaction"]>[0]
>[0]

type AgentResourceUsageKind =
  | "asset_upload"
  | "vision_transform"
  | "write_action"

export const AGENT_USAGE_HOUR_MS = 60 * 60 * 1000
export const AGENT_USAGE_DAY_MS = 24 * AGENT_USAGE_HOUR_MS
export const AGENT_RESOURCE_USAGE_RETENTION_GRACE_MS = AGENT_USAGE_DAY_MS
export const AGENT_RESOURCE_USAGE_PURGE_BATCH_SIZE = 100

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
    statusCode: 429,
    publicContext: {
      reason: "rate_limit_exceeded",
      retryAfter: Math.max(
        1,
        Math.ceil((input.windowEnd.getTime() - input.now.getTime()) / 1000)
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
