import type { Db } from "@enterprise-agentic-saas/db"
import {
  agentActionAssets,
  agentAssets,
  organizationFileUsage,
  storageObjectClaims,
  storageObjectCleanupJobs,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import { selectAgentAssetById } from "./agent-assets-access-repository"
import { assertAgentAssetClaim, assetNotFound } from "./agent-assets-domain"
import type { AgentAssetTransaction } from "./agent-assets-repository-support"
import { requireLiveUploadScope } from "./agent-assets-reservation-repository"

const releaseTemporaryUsage = async (
  tx: AgentAssetTransaction,
  input: { organizationId: string; sizeBytes: number; now: Date }
) => {
  const rows = await tx
    .update(organizationFileUsage)
    .set({
      usedBytes: sql`${organizationFileUsage.usedBytes} - ${input.sizeBytes}`,
      temporaryBytes: sql`${organizationFileUsage.temporaryBytes} - ${input.sizeBytes}`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(organizationFileUsage.organizationId, input.organizationId),
        sql`${organizationFileUsage.usedBytes} >= ${input.sizeBytes}`,
        sql`${organizationFileUsage.temporaryBytes} >= ${input.sizeBytes}`
      )
    )
    .returning({ organizationId: organizationFileUsage.organizationId })
  if (!rows[0]) throw new Error("Temporary storage usage is inconsistent")
}

const claimAgentAssetForCleanupInTransaction = async (
  tx: AgentAssetTransaction,
  input: {
    assetId: string
    organizationId: string
    terminalStatus: "deleted" | "expired"
    now: Date
    requireExpired: boolean
    activeLease: "conflict" | "skip"
    expected?: {
      assetStatus: "pending" | "ready"
      claimRevision: number
      storageCleanupRevision: number
      storageStatus: "pending" | "ready"
    }
  }
): Promise<boolean> => {
  const value = await selectAgentAssetById(tx, input)
  if (!value) return false
  if (
    (value.asset.status !== "pending" && value.asset.status !== "ready") ||
    (value.storage.status !== "pending" && value.storage.status !== "ready") ||
    (input.expected !== undefined &&
      (value.asset.status !== input.expected.assetStatus ||
        value.claim?.revision !== input.expected.claimRevision ||
        value.storage.cleanupRevision !==
          input.expected.storageCleanupRevision ||
        value.storage.status !== input.expected.storageStatus)) ||
    (input.requireExpired &&
      value.asset.expiresAt.getTime() > input.now.getTime())
  ) {
    return false
  }
  assertAgentAssetClaim(value)
  // DB state machineはterminal actionのAFTER triggerがreleasedAtを入れるまで
  // asset cleanupを許さない。期限切れleaseもaction sweepとの競合中は触らない。
  const unreleasedLeaseRows = await tx
    .select({ actionId: agentActionAssets.actionId })
    .from(agentActionAssets)
    .where(
      and(
        eq(agentActionAssets.organizationId, input.organizationId),
        eq(agentActionAssets.assetId, input.assetId),
        isNull(agentActionAssets.releasedAt)
      )
    )
    .limit(1)
  if (unreleasedLeaseRows[0]) {
    if (input.activeLease === "conflict") {
      throw new HttpError({ code: "conflict" })
    }
    return false
  }

  const deletedClaims = await tx
    .delete(storageObjectClaims)
    .where(
      and(
        eq(storageObjectClaims.storageObjectId, value.storage.id),
        eq(storageObjectClaims.organizationId, input.organizationId),
        eq(storageObjectClaims.holderType, "agent_asset"),
        eq(storageObjectClaims.holderId, value.asset.id),
        eq(storageObjectClaims.revision, value.claim?.revision ?? -1)
      )
    )
    .returning({ storageObjectId: storageObjectClaims.storageObjectId })
  if (!deletedClaims[0]) return false

  const assetRows = await tx
    .update(agentAssets)
    .set({
      storageObjectId: null,
      status: input.terminalStatus,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(agentAssets.id, value.asset.id),
        eq(agentAssets.organizationId, input.organizationId),
        eq(agentAssets.storageObjectId, value.storage.id),
        eq(agentAssets.status, value.asset.status),
        ...(input.requireExpired ? [lte(agentAssets.expiresAt, input.now)] : [])
      )
    )
    .returning({ id: agentAssets.id })
  if (!assetRows[0]) throw new Error("Agent asset cleanup lost its claim")

  await releaseTemporaryUsage(tx, {
    organizationId: input.organizationId,
    sizeBytes: value.storage.sizeBytes,
    now: input.now,
  })
  const storageRows = await tx
    .update(storageObjects)
    .set({
      status: "deleting",
      cleanupRevision: sql`${storageObjects.cleanupRevision} + 1`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(storageObjects.id, value.storage.id),
        eq(storageObjects.organizationId, input.organizationId),
        eq(storageObjects.status, value.storage.status),
        eq(storageObjects.cleanupRevision, value.storage.cleanupRevision)
      )
    )
    .returning({
      cleanupRevision: storageObjects.cleanupRevision,
      objectKey: storageObjects.objectKey,
    })
  const storage = storageRows[0]
  if (!storage?.objectKey) throw new Error("Storage cleanup lost its fence")
  await tx.insert(storageObjectCleanupJobs).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    storageObjectId: value.storage.id,
    expectedCleanupRevision: storage.cleanupRevision,
    objectKey: storage.objectKey,
    status: "pending",
    createdAt: input.now,
  })
  return true
}

export const discardPendingAgentAsset = async (
  db: Db,
  input: {
    assetId: string
    organizationId: string
    expectedClaimRevision: number
    expectedStorageCleanupRevision: number
    now?: Date
  }
) =>
  db.transaction((tx) =>
    claimAgentAssetForCleanupInTransaction(tx, {
      ...input,
      now: input.now ?? new Date(),
      activeLease: "skip",
      expected: {
        assetStatus: "pending",
        claimRevision: input.expectedClaimRevision,
        storageCleanupRevision: input.expectedStorageCleanupRevision,
        storageStatus: "pending",
      },
      requireExpired: false,
      terminalStatus: "expired",
    })
  )

export const deleteReadyAgentAsset = async (
  db: Db,
  input: {
    assetId: string
    organizationId: string
    sessionId: string
    userId: string
    now?: Date
  }
) =>
  db.transaction(async (tx) => {
    const now = input.now ?? new Date()
    const value = await selectAgentAssetById(tx, input)
    if (
      !value ||
      value.asset.status !== "ready" ||
      value.asset.uploaderId !== input.userId ||
      value.asset.sessionId !== input.sessionId
    ) {
      throw assetNotFound()
    }
    await requireLiveUploadScope(tx, {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      threadId: value.asset.threadId,
      userId: input.userId,
      now,
      expectedContextEpoch: value.asset.contextEpoch,
    })
    const claimed = await claimAgentAssetForCleanupInTransaction(tx, {
      assetId: input.assetId,
      organizationId: input.organizationId,
      terminalStatus: "deleted",
      now,
      activeLease: "conflict",
      requireExpired: false,
    })
    if (!claimed) throw assetNotFound()
    return true
  })

export const expireDueAgentAssets = async (
  db: Db,
  input: { now?: Date; limit?: number } = {}
) => {
  const now = input.now ?? new Date()
  const candidates = await db
    .select({
      assetId: agentAssets.id,
      organizationId: agentAssets.organizationId,
    })
    .from(agentAssets)
    .where(
      and(
        inArray(agentAssets.status, ["pending", "ready"]),
        lte(agentAssets.expiresAt, now)
      )
    )
    .limit(input.limit ?? 25)
  let expired = 0
  for (const candidate of candidates) {
    // oxlint-disable-next-line no-await-in-loop -- 各assetを短いfenced transactionでclaimする。
    const claimed = await db.transaction((tx) =>
      claimAgentAssetForCleanupInTransaction(tx, {
        ...candidate,
        now,
        activeLease: "skip",
        requireExpired: true,
        terminalStatus: "expired",
      })
    )
    if (claimed) expired += 1
  }
  return { considered: candidates.length, expired }
}
