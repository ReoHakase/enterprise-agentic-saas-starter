import type { Db } from "@enterprise-agentic-saas/db"
import {
  storageObjectClaims,
  storageObjectCleanupJobs,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, asc, eq, isNull, lte, notExists, or, sql } from "drizzle-orm"

import { purgeExpiredAgentResourceUsage } from "../agent/public"
import { expireDueAgentAssets } from "./agent-assets-repository"
import { agentAssetObjectKey } from "./constants"
import type { FileR2Bucket } from "./runtime"

const cleanupBatchSize = 25
const cleanupLeaseMs = 5 * 60 * 1000
const retryBaseMs = 30 * 1000
const retryMaximumMs = 60 * 60 * 1000

type StorageCleanupOutcome = "completed" | "failed" | "skipped" | "stale"

export type AgentAssetLifecycleResult = {
  usagePurge: { bucketsDeleted: number; operationsDeleted: number }
  expiry: { considered: number; expired: number }
  cleanup: {
    claimed: number
    completed: number
    failed: number
    stale: number
  }
}

const retryDelayMs = (attempt: number) =>
  Math.min(retryBaseMs * 2 ** Math.max(0, attempt - 1), retryMaximumMs)

const randomLeaseToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

const hasExactV2DeleteFence = async (
  database: Db,
  input: {
    expectedCleanupRevision: number
    objectKey: string
    organizationId: string
    storageObjectId: string
  }
) =>
  database.transaction(async (tx) => {
    const rows = await tx
      .select({ id: storageObjects.id })
      .from(storageObjects)
      .where(
        and(
          eq(storageObjects.id, input.storageObjectId),
          eq(storageObjects.organizationId, input.organizationId),
          eq(storageObjects.status, "deleting"),
          eq(storageObjects.keyVersion, 2),
          eq(storageObjects.cleanupRevision, input.expectedCleanupRevision),
          eq(storageObjects.objectKey, input.objectKey),
          notExists(
            tx
              .select({ storageObjectId: storageObjectClaims.storageObjectId })
              .from(storageObjectClaims)
              .where(
                and(
                  eq(
                    storageObjectClaims.storageObjectId,
                    input.storageObjectId
                  ),
                  eq(storageObjectClaims.organizationId, input.organizationId)
                )
              )
          )
        )
      )
      .limit(1)
    return Boolean(rows[0])
  })

const completeExactDelete = async (
  database: Db,
  input: {
    attempts: number
    expectedCleanupRevision: number
    jobId: string
    leaseToken: string
    objectKey: string
    organizationId: string
    storageObjectId: string
    now: Date
  }
) =>
  database.transaction(async (tx) => {
    const ownsLease = and(
      eq(storageObjectCleanupJobs.id, input.jobId),
      eq(storageObjectCleanupJobs.status, "processing"),
      eq(storageObjectCleanupJobs.attempts, input.attempts),
      eq(storageObjectCleanupJobs.leaseToken, input.leaseToken)
    )
    const jobRows = await tx
      .select({ id: storageObjectCleanupJobs.id })
      .from(storageObjectCleanupJobs)
      .where(ownsLease)
      .limit(1)
    if (!jobRows[0]) return false

    const updatedObjects = await tx
      .update(storageObjects)
      .set({
        objectKey: null,
        status: "deleted",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(storageObjects.id, input.storageObjectId),
          eq(storageObjects.organizationId, input.organizationId),
          eq(storageObjects.status, "deleting"),
          eq(storageObjects.cleanupRevision, input.expectedCleanupRevision),
          eq(storageObjects.objectKey, input.objectKey),
          notExists(
            tx
              .select({ storageObjectId: storageObjectClaims.storageObjectId })
              .from(storageObjectClaims)
              .where(
                and(
                  eq(
                    storageObjectClaims.storageObjectId,
                    input.storageObjectId
                  ),
                  eq(storageObjectClaims.organizationId, input.organizationId)
                )
              )
          )
        )
      )
      .returning({ id: storageObjects.id })
    if (!updatedObjects[0]) return false

    const completedJobs = await tx
      .update(storageObjectCleanupJobs)
      .set({
        completedAt: input.now,
        lastErrorCode: null,
        leaseExpiresAt: null,
        leaseToken: null,
        lockedAt: null,
        nextAttemptAt: null,
        status: "completed",
      })
      .where(ownsLease)
      .returning({ id: storageObjectCleanupJobs.id })
    if (!completedJobs[0]) {
      throw new Error("Storage cleanup completion lost its lease")
    }
    return true
  })

/** @internal */
export const processStorageObjectCleanupJobs = async ({
  bucket,
  database,
  now = new Date(),
  onFailure,
}: {
  bucket: Pick<FileR2Bucket, "delete">
  database: Db
  now?: Date
  onFailure?: (failure: { attempts: number; errorCode: string }) => void
}) => {
  const retryIsReady = or(
    isNull(storageObjectCleanupJobs.nextAttemptAt),
    lte(storageObjectCleanupJobs.nextAttemptAt, now)
  )
  const claimable = or(
    eq(storageObjectCleanupJobs.status, "pending"),
    and(eq(storageObjectCleanupJobs.status, "failed"), retryIsReady),
    and(
      eq(storageObjectCleanupJobs.status, "processing"),
      lte(storageObjectCleanupJobs.leaseExpiresAt, now)
    )
  )
  const eligible = await database
    .select({ id: storageObjectCleanupJobs.id })
    .from(storageObjectCleanupJobs)
    .where(claimable)
    .orderBy(asc(storageObjectCleanupJobs.createdAt))
    .limit(cleanupBatchSize)

  const outcomes = await Promise.all(
    eligible.map(async ({ id }): Promise<StorageCleanupOutcome> => {
      const leaseToken = randomLeaseToken()
      const leaseExpiresAt = new Date(now.getTime() + cleanupLeaseMs)
      const claimedRows = await database
        .update(storageObjectCleanupJobs)
        .set({
          attempts: sql`${storageObjectCleanupJobs.attempts} + 1`,
          lastErrorCode: null,
          leaseExpiresAt,
          leaseToken,
          lockedAt: now,
          nextAttemptAt: null,
          status: "processing",
        })
        .where(and(eq(storageObjectCleanupJobs.id, id), claimable))
        .returning({
          attempts: storageObjectCleanupJobs.attempts,
          expectedCleanupRevision:
            storageObjectCleanupJobs.expectedCleanupRevision,
          objectKey: storageObjectCleanupJobs.objectKey,
          organizationId: storageObjectCleanupJobs.organizationId,
          storageObjectId: storageObjectCleanupJobs.storageObjectId,
        })
      const claimed = claimedRows[0]
      if (!claimed) return "skipped"

      const ownsLease = and(
        eq(storageObjectCleanupJobs.id, id),
        eq(storageObjectCleanupJobs.status, "processing"),
        eq(storageObjectCleanupJobs.attempts, claimed.attempts),
        eq(storageObjectCleanupJobs.leaseToken, leaseToken)
      )
      let errorCode = "r2_cleanup_failed"
      try {
        const canonicalKey = agentAssetObjectKey({
          organizationId: claimed.organizationId,
          storageObjectId: claimed.storageObjectId,
        })
        if (claimed.objectKey !== canonicalKey) {
          errorCode = "invalid_exact_key"
          throw new Error("Invalid storage cleanup target")
        }
        const fenced = await hasExactV2DeleteFence(database, claimed)
        if (!fenced) {
          errorCode = "cleanup_fence_mismatch"
          throw new Error("Storage cleanup fence mismatch")
        }

        await bucket.delete(claimed.objectKey)
        const completed = await completeExactDelete(database, {
          ...claimed,
          jobId: id,
          leaseToken,
          now,
        })
        return completed ? "completed" : "stale"
      } catch {
        const failedRows = await database
          .update(storageObjectCleanupJobs)
          .set({
            lastErrorCode: errorCode,
            leaseExpiresAt: null,
            leaseToken: null,
            lockedAt: null,
            nextAttemptAt: new Date(
              now.getTime() + retryDelayMs(claimed.attempts)
            ),
            status: "failed",
          })
          .where(ownsLease)
          .returning({ id: storageObjectCleanupJobs.id })
        if (!failedRows[0]) return "stale"
        onFailure?.({ attempts: claimed.attempts, errorCode })
        return "failed"
      }
    })
  )

  return {
    claimed: outcomes.filter((outcome) => outcome !== "skipped").length,
    completed: outcomes.filter((outcome) => outcome === "completed").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    stale: outcomes.filter((outcome) => outcome === "stale").length,
  }
}

export const processAgentAssetLifecycle = async ({
  bucket,
  database,
  now = new Date(),
  onFailure,
}: {
  bucket: Pick<FileR2Bucket, "delete">
  database: Db
  now?: Date
  onFailure?: (failure: { attempts: number; errorCode: string }) => void
}): Promise<AgentAssetLifecycleResult> => {
  const usagePurge = await purgeExpiredAgentResourceUsage(database, { now })
  const expiry = await expireDueAgentAssets(database, { now })
  const cleanup = await processStorageObjectCleanupJobs({
    bucket,
    database,
    now,
    onFailure,
  })
  return { usagePurge, expiry, cleanup }
}
