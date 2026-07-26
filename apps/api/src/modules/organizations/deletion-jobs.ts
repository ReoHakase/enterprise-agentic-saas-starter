import type { Db } from "@enterprise-agentic-saas/db"
import { organizationDeletionJobs } from "@enterprise-agentic-saas/db/schema"
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm"

const cleanupBatchSize = 25
const cleanupLeaseMs = 5 * 60 * 1000
const retryBaseMs = 30 * 1000
const retryMaximumMs = 60 * 60 * 1000

type R2ObjectSummary = {
  key: string
}

type R2ListResult = {
  objects: R2ObjectSummary[]
  truncated: boolean
  cursor?: string
}

export type OrganizationFilesBucket = {
  list: (options: {
    prefix: string
    cursor?: string
    limit?: number
  }) => Promise<R2ListResult>
  delete: (keys: string | string[]) => Promise<unknown>
}

export type DeletionJobRunResult = {
  claimed: number
  completed: number
  failed: number
  stale: number
}

export type DeletionJobFailure = {
  attempts: number
  jobId: string
  organizationId: string
}

type DeletionJobOutcome = "completed" | "failed" | "skipped" | "stale"

const organizationFilesPrefix = (organizationId: string) =>
  `organizations/${encodeURIComponent(organizationId)}/`

/** @internal */
export const deleteOrganizationFiles = async (
  bucket: OrganizationFilesBucket,
  organizationId: string
): Promise<number> => {
  const prefix = organizationFilesPrefix(organizationId)
  let cursor: string | undefined
  let deleted = 0

  do {
    // oxlint-disable-next-line no-await-in-loop -- cursorは直前pageから返るため逐次取得が必須。
    const page = await bucket.list({ prefix, cursor, limit: 1000 })
    const keys = page.objects.map(({ key }) => key)
    if (keys.some((key) => !key.startsWith(prefix))) {
      throw new Error("R2 returned an object outside the requested prefix")
    }
    if (keys.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- page削除完了後に次cursorへ進み、再試行を冪等に保つ。
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

const retryDelayMs = (attempt: number) =>
  Math.min(retryBaseMs * 2 ** Math.max(0, attempt - 1), retryMaximumMs)

export const processOrganizationDeletionJobs = async ({
  bucket,
  database,
  now = new Date(),
  onFailure,
}: {
  bucket: OrganizationFilesBucket
  database: Db
  now?: Date
  onFailure?: (failure: DeletionJobFailure) => void
}): Promise<DeletionJobRunResult> => {
  const staleLease = new Date(now.getTime() - cleanupLeaseMs)
  const retryIsReady = or(
    isNull(organizationDeletionJobs.nextAttemptAt),
    lte(organizationDeletionJobs.nextAttemptAt, now)
  )
  const claimable = or(
    eq(organizationDeletionJobs.status, "pending"),
    and(eq(organizationDeletionJobs.status, "failed"), retryIsReady),
    and(
      eq(organizationDeletionJobs.status, "processing"),
      lte(organizationDeletionJobs.lockedAt, staleLease)
    )
  )
  const eligible = await database
    .select({ id: organizationDeletionJobs.id })
    .from(organizationDeletionJobs)
    .where(claimable)
    .orderBy(asc(organizationDeletionJobs.requestedAt))
    .limit(cleanupBatchSize)

  const outcomes = await Promise.all(
    eligible.map(async ({ id }): Promise<DeletionJobOutcome> => {
      const claimedRows = await database
        .update(organizationDeletionJobs)
        .set({
          status: "processing",
          attempts: sql`${organizationDeletionJobs.attempts} + 1`,
          lockedAt: now,
          lastErrorCode: null,
          nextAttemptAt: null,
        })
        .where(and(eq(organizationDeletionJobs.id, id), claimable))
        .returning({
          attempts: organizationDeletionJobs.attempts,
          organizationId: organizationDeletionJobs.organizationId,
        })

      const claimed = claimedRows[0]
      if (!claimed) return "skipped"

      // attemptsとlockedAtをlease tokenとして使い、期限切れjobを再取得した
      // 新workerの状態を旧workerが上書きしないようにする。
      const ownsLease = and(
        eq(organizationDeletionJobs.id, id),
        eq(organizationDeletionJobs.status, "processing"),
        eq(organizationDeletionJobs.attempts, claimed.attempts),
        eq(organizationDeletionJobs.lockedAt, now)
      )

      try {
        await deleteOrganizationFiles(bucket, claimed.organizationId)
        const completedRows = await database
          .update(organizationDeletionJobs)
          .set({
            status: "completed",
            completedAt: now,
            lockedAt: null,
            nextAttemptAt: null,
          })
          .where(ownsLease)
          .returning({ id: organizationDeletionJobs.id })
        return completedRows[0] ? "completed" : "stale"
      } catch {
        const failedRows = await database
          .update(organizationDeletionJobs)
          .set({
            status: "failed",
            lastErrorCode: "r2_cleanup_failed",
            lockedAt: null,
            nextAttemptAt: new Date(
              now.getTime() + retryDelayMs(claimed.attempts)
            ),
          })
          .where(ownsLease)
          .returning({ id: organizationDeletionJobs.id })
        if (!failedRows[0]) {
          return "stale"
        }
        onFailure?.({
          attempts: claimed.attempts,
          jobId: id,
          organizationId: claimed.organizationId,
        })
        return "failed"
      }
    })
  )

  const completed = outcomes.filter((outcome) => outcome === "completed").length
  const failed = outcomes.filter((outcome) => outcome === "failed").length
  const stale = outcomes.filter((outcome) => outcome === "stale").length
  const claimed = outcomes.filter((outcome) => outcome !== "skipped").length

  return { claimed, completed, failed, stale }
}
