import type { Db } from "@enterprise-agentic-saas/db"
import { fileCleanupJobs } from "@enterprise-agentic-saas/db/schema"
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm"

import type { FileR2Bucket } from "./runtime"

const cleanupBatchSize = 25
const cleanupLeaseMs = 5 * 60 * 1000
const retryBaseMs = 30 * 1000
const retryMaximumMs = 60 * 60 * 1000

const organizationFilePrefix = (organizationId: string) =>
  `organizations/${encodeURIComponent(organizationId)}/files/`

const isCanonicalKeySegment = (value: string) => {
  if (!value || value === "." || value === "..") return false
  try {
    return encodeURIComponent(decodeURIComponent(value)) === value
  } catch {
    return false
  }
}

const isCanonicalExactTarget = (target: string, allowedPrefix: string) => {
  if (!target.startsWith(allowedPrefix)) return false
  const segments = target.slice(allowedPrefix.length).split("/")
  return (
    segments.length === 3 &&
    segments[0] === "issue" &&
    isCanonicalKeySegment(segments[1] ?? "") &&
    isCanonicalKeySegment(segments[2] ?? "")
  )
}

const isCanonicalOwnerPrefix = (target: string, allowedPrefix: string) => {
  if (!target.startsWith(allowedPrefix) || !target.endsWith("/")) return false
  const segments = target.slice(allowedPrefix.length, -1).split("/")
  return (
    segments.length === 2 &&
    segments[0] === "issue" &&
    isCanonicalKeySegment(segments[1] ?? "")
  )
}

export type FileCleanupBucket = Pick<FileR2Bucket, "delete" | "list">

export type FileCleanupJobRunResult = {
  claimed: number
  completed: number
  failed: number
  stale: number
}

type FileCleanupJobOutcome = "completed" | "failed" | "skipped" | "stale"

const retryDelayMs = (attempt: number) =>
  Math.min(retryBaseMs * 2 ** Math.max(0, attempt - 1), retryMaximumMs)

const deleteFilePrefix = async (
  bucket: FileCleanupBucket,
  prefix: string
): Promise<number> => {
  let cursor: string | undefined
  let deleted = 0

  do {
    // oxlint-disable-next-line no-await-in-loop -- cursor paginationは逐次処理が必要。
    const page = await bucket.list({ cursor, limit: 1000, prefix })
    const keys = page.objects.map(({ key }) => key)
    if (keys.some((key) => !key.startsWith(prefix))) {
      throw new Error("R2 returned an object outside the cleanup prefix")
    }
    if (keys.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- page削除後に次cursorへ進めて冪等にする。
      await bucket.delete(keys)
      deleted += keys.length
    }
    cursor = page.truncated ? page.cursor : undefined
    if (page.truncated && !cursor) {
      throw new Error("R2 returned a truncated page without a cursor")
    }
  } while (cursor)

  return deleted
}

export const processFileCleanupJobs = async ({
  bucket,
  database,
  now = new Date(),
  onFailure,
}: {
  bucket: FileCleanupBucket
  database: Db
  now?: Date
  onFailure?: (failure: { attempts: number }) => void
}): Promise<FileCleanupJobRunResult> => {
  const staleLease = new Date(now.getTime() - cleanupLeaseMs)
  const retryIsReady = or(
    isNull(fileCleanupJobs.nextAttemptAt),
    lte(fileCleanupJobs.nextAttemptAt, now)
  )
  const claimable = or(
    eq(fileCleanupJobs.status, "pending"),
    and(eq(fileCleanupJobs.status, "failed"), retryIsReady),
    and(
      eq(fileCleanupJobs.status, "processing"),
      lte(fileCleanupJobs.lockedAt, staleLease)
    )
  )
  const eligible = await database
    .select({ id: fileCleanupJobs.id })
    .from(fileCleanupJobs)
    .where(claimable)
    .orderBy(asc(fileCleanupJobs.createdAt))
    .limit(cleanupBatchSize)

  const outcomes = await Promise.all(
    eligible.map(async ({ id }): Promise<FileCleanupJobOutcome> => {
      const claimedRows = await database
        .update(fileCleanupJobs)
        .set({
          attempts: sql`${fileCleanupJobs.attempts} + 1`,
          lastErrorCode: null,
          lockedAt: now,
          nextAttemptAt: null,
          status: "processing",
        })
        .where(and(eq(fileCleanupJobs.id, id), claimable))
        .returning({
          attempts: fileCleanupJobs.attempts,
          kind: fileCleanupJobs.kind,
          objectKey: fileCleanupJobs.objectKey,
          organizationId: fileCleanupJobs.organizationId,
          prefix: fileCleanupJobs.prefix,
        })
      const claimed = claimedRows[0]
      if (!claimed) return "skipped"

      const ownsLease = and(
        eq(fileCleanupJobs.id, id),
        eq(fileCleanupJobs.status, "processing"),
        eq(fileCleanupJobs.attempts, claimed.attempts),
        eq(fileCleanupJobs.lockedAt, now)
      )

      try {
        const allowedPrefix = organizationFilePrefix(claimed.organizationId)
        if (
          claimed.kind === "exact" &&
          claimed.objectKey &&
          isCanonicalExactTarget(claimed.objectKey, allowedPrefix)
        ) {
          await bucket.delete(claimed.objectKey)
        } else if (
          claimed.kind === "owner_prefix" &&
          claimed.prefix &&
          isCanonicalOwnerPrefix(claimed.prefix, allowedPrefix)
        ) {
          await deleteFilePrefix(bucket, claimed.prefix)
        } else {
          throw new Error("Invalid file cleanup target")
        }

        const completedRows = await database
          .update(fileCleanupJobs)
          .set({
            completedAt: now,
            lockedAt: null,
            nextAttemptAt: null,
            status: "completed",
          })
          .where(ownsLease)
          .returning({ id: fileCleanupJobs.id })
        return completedRows[0] ? "completed" : "stale"
      } catch {
        const failedRows = await database
          .update(fileCleanupJobs)
          .set({
            lastErrorCode: "r2_cleanup_failed",
            lockedAt: null,
            nextAttemptAt: new Date(
              now.getTime() + retryDelayMs(claimed.attempts)
            ),
            status: "failed",
          })
          .where(ownsLease)
          .returning({ id: fileCleanupJobs.id })
        if (!failedRows[0]) return "stale"
        onFailure?.({ attempts: claimed.attempts })
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
