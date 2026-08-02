import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import type {
  FileCleanupJobKind,
  FileCleanupJobStatus,
  OrganizationDeletionJobStatus,
  StorageObjectCleanupJobStatus,
} from "./values"

// cleanup完了後にもretry receiptを残すため、storage objectとorganizationへの
// FKは意図的に持たない。expected revisionとexact keyの両方を照合して削除する。
export const storageObjectCleanupJobs = sqliteTable(
  "storage_object_cleanup_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    storageObjectId: text("storage_object_id").notNull(),
    expectedCleanupRevision: integer("expected_cleanup_revision").notNull(),
    objectKey: text("object_key").notNull(),
    status: text("status")
      .$type<StorageObjectCleanupJobStatus>()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    leaseToken: text("lease_token"),
    lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("storage_object_cleanup_jobs_revision_uidx").on(
      table.storageObjectId,
      table.expectedCleanupRevision
    ),
    uniqueIndex("storage_object_cleanup_jobs_object_key_uidx").on(
      table.objectKey
    ),
    index("storage_object_cleanup_jobs_organization_idx").on(
      table.organizationId
    ),
    index("storage_object_cleanup_jobs_claim_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt
    ),
    check(
      "storage_object_cleanup_jobs_revision_check",
      sql`${table.expectedCleanupRevision} >= 1`
    ),
    check(
      "storage_object_cleanup_jobs_object_key_check",
      sql`length(${table.objectKey}) between 1 and 1024`
    ),
    check(
      "storage_object_cleanup_jobs_status_check",
      sql`${table.status} in ('pending', 'processing', 'failed', 'completed')`
    ),
    check(
      "storage_object_cleanup_jobs_attempts_check",
      sql`${table.attempts} >= 0`
    ),
    check(
      "storage_object_cleanup_jobs_last_error_code_check",
      sql`${table.lastErrorCode} is null or (
        length(${table.lastErrorCode}) between 1 and 96
        and ${table.lastErrorCode} glob '[A-Za-z]*'
        and ${table.lastErrorCode} not glob '*[^A-Za-z0-9_.:-]*'
      )`
    ),
    check(
      "storage_object_cleanup_jobs_lease_check",
      sql`(
        ${table.status} = 'processing'
        and ${table.leaseToken} is not null
        and length(${table.leaseToken}) = 64
        and ${table.leaseToken} not glob '*[^0-9a-f]*'
        and ${table.lockedAt} is not null
        and ${table.leaseExpiresAt} is not null
        and ${table.leaseExpiresAt} > ${table.lockedAt}
      ) or (
        ${table.status} != 'processing'
        and ${table.leaseToken} is null
        and ${table.lockedAt} is null
        and ${table.leaseExpiresAt} is null
      )`
    ),
    check(
      "storage_object_cleanup_jobs_completed_at_check",
      sql`(
        ${table.status} = 'completed'
        and ${table.completedAt} is not null
      ) or (
        ${table.status} != 'completed'
        and ${table.completedAt} is null
      )`
    ),
  ]
)

// promotionは0015のimmediate triggerが固定statement順を強制する。
// ready asset/fileとclaimの一致をrepository assertionだけに依存させない。

// fileやownerをDBから削除した後もR2 cleanupを再試行するため、
// organization/file/issueへの外部キーは意図的に持たない。
export const fileCleanupJobs = sqliteTable(
  "file_cleanup_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    kind: text("kind").$type<FileCleanupJobKind>().notNull(),
    objectKey: text("object_key"),
    prefix: text("prefix"),
    status: text("status")
      .$type<FileCleanupJobStatus>()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("file_cleanup_jobs_object_key_uidx")
      .on(table.objectKey)
      .where(sql`${table.kind} = 'exact'`),
    uniqueIndex("file_cleanup_jobs_prefix_uidx")
      .on(table.prefix)
      .where(sql`${table.kind} = 'owner_prefix'`),
    index("file_cleanup_jobs_organization_idx").on(table.organizationId),
    index("file_cleanup_jobs_claim_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt
    ),
    check(
      "file_cleanup_jobs_kind_check",
      sql`${table.kind} in ('exact', 'owner_prefix')`
    ),
    check(
      "file_cleanup_jobs_target_check",
      sql`(
        ${table.kind} = 'exact'
        and length(${table.objectKey}) between 1 and 1024
        and ${table.prefix} is null
      ) or (
        ${table.kind} = 'owner_prefix'
        and ${table.objectKey} is null
        and length(${table.prefix}) between 1 and 1024
      )`
    ),
    check(
      "file_cleanup_jobs_status_check",
      sql`${table.status} in ('pending', 'processing', 'failed', 'completed')`
    ),
    check("file_cleanup_jobs_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "file_cleanup_jobs_last_error_code_check",
      sql`${table.lastErrorCode} is null or (
        length(${table.lastErrorCode}) between 1 and 96
        and ${table.lastErrorCode} glob '[A-Za-z]*'
        and ${table.lastErrorCode} not glob '*[^A-Za-z0-9_.:-]*'
      )`
    ),
  ]
)

// organization本体を即時削除した後も、R2 cleanupを安全に再試行するための
// PIIを含まないdurable job。organizationへの外部キーは意図的に持たない。
export const organizationDeletionJobs = sqliteTable(
  "organization_deletion_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    requestedByUserId: text("requested_by_user_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status")
      .$type<OrganizationDeletionJobStatus>()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("organization_deletion_jobs_request_uidx").on(
      table.requestedByUserId,
      table.idempotencyKey
    ),
    index("organization_deletion_jobs_organization_idx").on(
      table.organizationId
    ),
    index("organization_deletion_jobs_retry_idx").on(
      table.status,
      table.nextAttemptAt,
      table.requestedAt
    ),
    check(
      "organization_deletion_jobs_status_check",
      sql`${table.status} in ('pending', 'processing', 'failed', 'completed')`
    ),
    check(
      "organization_deletion_jobs_attempts_check",
      sql`${table.attempts} >= 0`
    ),
  ]
)
