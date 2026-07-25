import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { organization, user } from "./auth.generated"
import type {
  ProfileImageSubjectType,
  ProfileImageStatus,
  ProfileImageCleanupJobStatus,
} from "./values"

// User / Organizationで共通のprofile image metadata。auth生成tableの
// image/logo列は互換用URLだけを保持し、R2 keyやupload状態はここへ閉じる。
export const profileImages = sqliteTable(
  "profile_images",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type")
      .$type<ProfileImageSubjectType>()
      .notNull(),
    subjectId: text("subject_id").notNull(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    uploadId: text("upload_id").notNull(),
    sourceHash: text("source_hash").notNull(),
    version: integer("version").notNull(),
    objectKey: text("object_key").notNull(),
    fallbackUrl: text("fallback_url"),
    etag: text("etag"),
    status: text("status")
      .$type<ProfileImageStatus>()
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("profile_images_subject_upload_uidx").on(
      table.subjectType,
      table.subjectId,
      table.uploadId
    ),
    uniqueIndex("profile_images_subject_version_uidx").on(
      table.subjectType,
      table.subjectId,
      table.version
    ),
    uniqueIndex("profile_images_subject_ready_uidx")
      .on(table.subjectType, table.subjectId)
      .where(sql`${table.status} = 'ready'`),
    uniqueIndex("profile_images_object_key_uidx").on(table.objectKey),
    index("profile_images_subject_status_version_idx").on(
      table.subjectType,
      table.subjectId,
      table.status,
      table.version
    ),
    check(
      "profile_images_subject_check",
      sql`(
        ${table.subjectType} = 'user'
        and ${table.userId} is not null
        and ${table.userId} = ${table.subjectId}
        and ${table.organizationId} is null
      ) or (
        ${table.subjectType} = 'organization'
        and ${table.userId} is null
        and ${table.organizationId} is not null
        and ${table.organizationId} = ${table.subjectId}
      )`
    ),
    check(
      "profile_images_status_check",
      sql`${table.status} in ('pending', 'ready', 'superseded')`
    ),
    check("profile_images_version_check", sql`${table.version} > 0`),
    check(
      "profile_images_upload_id_check",
      sql`length(${table.uploadId}) between 1 and 128`
    ),
    check(
      "profile_images_source_hash_check",
      sql`length(${table.sourceHash}) = 64 and ${table.sourceHash} not glob '*[^0-9a-f]*'`
    ),
    check(
      "profile_images_object_key_check",
      sql`length(${table.objectKey}) between 1 and 1024`
    ),
    check(
      "profile_images_fallback_url_check",
      sql`${table.fallbackUrl} is null or length(${table.fallbackUrl}) between 1 and 2048`
    ),
    check(
      "profile_images_ready_etag_check",
      sql`${table.status} != 'ready' or (
        ${table.etag} is not null
        and length(${table.etag}) between 1 and 128
      )`
    ),
  ]
)

// profile image rowを置換・削除した後もR2 cleanupを再試行する。
// subject本体へのFKは、subject削除後にもjobを残すため意図的に持たない。
export const profileImageCleanupJobs = sqliteTable(
  "profile_image_cleanup_jobs",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type")
      .$type<ProfileImageSubjectType>()
      .notNull(),
    subjectId: text("subject_id").notNull(),
    objectKey: text("object_key").notNull(),
    status: text("status")
      .$type<ProfileImageCleanupJobStatus>()
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
    uniqueIndex("profile_image_cleanup_jobs_object_key_uidx").on(
      table.objectKey
    ),
    index("profile_image_cleanup_jobs_claim_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt
    ),
    check(
      "profile_image_cleanup_jobs_subject_type_check",
      sql`${table.subjectType} in ('user', 'organization')`
    ),
    check(
      "profile_image_cleanup_jobs_status_check",
      sql`${table.status} in ('pending', 'processing', 'failed', 'completed')`
    ),
    check(
      "profile_image_cleanup_jobs_attempts_check",
      sql`${table.attempts} >= 0`
    ),
    check(
      "profile_image_cleanup_jobs_object_key_check",
      sql`length(${table.objectKey}) between 1 and 1024`
    ),
    check(
      "profile_image_cleanup_jobs_last_error_code_check",
      sql`${table.lastErrorCode} is null or (
        length(${table.lastErrorCode}) between 1 and 96
        and ${table.lastErrorCode} glob '[A-Za-z]*'
        and ${table.lastErrorCode} not glob '*[^A-Za-z0-9_.:-]*'
      )`
    ),
  ]
)
