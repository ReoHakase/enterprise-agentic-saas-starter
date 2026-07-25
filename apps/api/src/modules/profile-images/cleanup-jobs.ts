import type { Db } from "@enterprise-agentic-saas/db"
import { profileImageCleanupJobs } from "@enterprise-agentic-saas/db/schema"
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm"

import type { FileR2Bucket } from "../files/public"
import type { ProfileImageSubject } from "./constants"
import { expireStalePendingProfileImages } from "./repository"

const cleanupBatchSize = 25
const cleanupLeaseMs = 5 * 60 * 1000
const pendingUploadLeaseMs = 60 * 60 * 1000
const retryBaseMs = 30 * 1000
const retryMaximumMs = 60 * 60 * 1000

export type ProfileImageCleanupBucket = Pick<FileR2Bucket, "delete">

export type ProfileImageCleanupJobRunResult = {
  claimed: number
  completed: number
  expired: number
  failed: number
  stale: number
}

type ProfileImageCleanupJobOutcome =
  | "completed"
  | "failed"
  | "skipped"
  | "stale"

const retryDelayMs = (attempt: number) =>
  Math.min(retryBaseMs * 2 ** Math.max(0, attempt - 1), retryMaximumMs)

const canonicalSegment = (value: string) => {
  if (!value || value === "." || value === "..") return false
  try {
    return encodeURIComponent(decodeURIComponent(value)) === value
  } catch {
    return false
  }
}

const canonicalProfileImageKey = (
  objectKey: string,
  subject: ProfileImageSubject
) => {
  const prefix =
    subject.type === "user"
      ? `users/${encodeURIComponent(subject.id)}/profile-images/`
      : `organizations/${encodeURIComponent(subject.id)}/profile-images/`
  if (!objectKey.startsWith(prefix)) return false
  const filename = objectKey.slice(prefix.length)
  if (!filename.endsWith(".webp") || filename.includes("/")) return false
  return canonicalSegment(filename.slice(0, -".webp".length))
}

export const processProfileImageCleanupJobs = async ({
  bucket,
  database,
  now = new Date(),
  onFailure,
}: {
  bucket: ProfileImageCleanupBucket
  database: Db
  now?: Date
  onFailure?: (failure: { attempts: number }) => void
}): Promise<ProfileImageCleanupJobRunResult> => {
  const expired = await expireStalePendingProfileImages(database, {
    cutoff: new Date(now.getTime() - pendingUploadLeaseMs),
    limit: cleanupBatchSize,
  })
  const staleLease = new Date(now.getTime() - cleanupLeaseMs)
  const retryIsReady = or(
    isNull(profileImageCleanupJobs.nextAttemptAt),
    lte(profileImageCleanupJobs.nextAttemptAt, now)
  )
  const claimable = or(
    eq(profileImageCleanupJobs.status, "pending"),
    and(eq(profileImageCleanupJobs.status, "failed"), retryIsReady),
    and(
      eq(profileImageCleanupJobs.status, "processing"),
      lte(profileImageCleanupJobs.lockedAt, staleLease)
    )
  )
  const eligible = await database
    .select({ id: profileImageCleanupJobs.id })
    .from(profileImageCleanupJobs)
    .where(claimable)
    .orderBy(asc(profileImageCleanupJobs.createdAt))
    .limit(cleanupBatchSize)

  const outcomes = await Promise.all(
    eligible.map(async ({ id }): Promise<ProfileImageCleanupJobOutcome> => {
      const claimedRows = await database
        .update(profileImageCleanupJobs)
        .set({
          attempts: sql`${profileImageCleanupJobs.attempts} + 1`,
          lastErrorCode: null,
          lockedAt: now,
          nextAttemptAt: null,
          status: "processing",
        })
        .where(and(eq(profileImageCleanupJobs.id, id), claimable))
        .returning({
          attempts: profileImageCleanupJobs.attempts,
          objectKey: profileImageCleanupJobs.objectKey,
          subjectId: profileImageCleanupJobs.subjectId,
          subjectType: profileImageCleanupJobs.subjectType,
        })
      const claimed = claimedRows[0]
      if (!claimed) return "skipped"

      const ownsLease = and(
        eq(profileImageCleanupJobs.id, id),
        eq(profileImageCleanupJobs.status, "processing"),
        eq(profileImageCleanupJobs.attempts, claimed.attempts),
        eq(profileImageCleanupJobs.lockedAt, now)
      )

      try {
        if (
          !canonicalProfileImageKey(claimed.objectKey, {
            type: claimed.subjectType,
            id: claimed.subjectId,
          })
        ) {
          throw new Error("Invalid profile image cleanup target")
        }
        await bucket.delete(claimed.objectKey)
        const completedRows = await database
          .update(profileImageCleanupJobs)
          .set({
            completedAt: now,
            lockedAt: null,
            nextAttemptAt: null,
            status: "completed",
          })
          .where(ownsLease)
          .returning({ id: profileImageCleanupJobs.id })
        return completedRows[0] ? "completed" : "stale"
      } catch {
        const failedRows = await database
          .update(profileImageCleanupJobs)
          .set({
            lastErrorCode: "r2_cleanup_failed",
            lockedAt: null,
            nextAttemptAt: new Date(
              now.getTime() + retryDelayMs(claimed.attempts)
            ),
            status: "failed",
          })
          .where(ownsLease)
          .returning({ id: profileImageCleanupJobs.id })
        if (!failedRows[0]) return "stale"
        onFailure?.({ attempts: claimed.attempts })
        return "failed"
      }
    })
  )

  return {
    claimed: outcomes.filter((outcome) => outcome !== "skipped").length,
    completed: outcomes.filter((outcome) => outcome === "completed").length,
    expired,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    stale: outcomes.filter((outcome) => outcome === "stale").length,
  }
}
