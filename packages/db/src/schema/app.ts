import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { invitation, organization, user } from "./auth.generated"

export const issueStatuses = ["open", "in_progress", "closed"] as const
export type IssueStatus = (typeof issueStatuses)[number]

export const issuePriorities = [
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const
export type IssuePriority = (typeof issuePriorities)[number]

export const issueActivityFields = [
  "title",
  "description",
  "status",
  "priority",
  "assignee",
  "labels",
  "due_date",
] as const
export type IssueActivityField = (typeof issueActivityFields)[number]
export const issueActivityKinds = [
  "created",
  "field_changed",
  "legacy_updated",
  "file_added",
  "file_deleted",
] as const
export type IssueActivityKind = (typeof issueActivityKinds)[number]
export type IssueActivityValue = string | string[] | null

export type AuditLogMetadata = Record<string, string | number | boolean | null>

export const MAX_FILE_SIZE_BYTES = 20_000_000 as const
export const ORGANIZATION_FILE_QUOTA_BYTES = 1_073_741_824 as const

export const fileOwnerTypes = ["issue"] as const
export type FileOwnerType = (typeof fileOwnerTypes)[number]

export const fileStatuses = ["pending", "ready"] as const
export type FileStatus = (typeof fileStatuses)[number]

export const profileImageSubjectTypes = ["user", "organization"] as const
export type ProfileImageSubjectType = (typeof profileImageSubjectTypes)[number]

export const profileImageStatuses = ["pending", "ready", "superseded"] as const
export type ProfileImageStatus = (typeof profileImageStatuses)[number]

export const profileImageCleanupJobStatuses = [
  "pending",
  "processing",
  "failed",
  "completed",
] as const
export type ProfileImageCleanupJobStatus =
  (typeof profileImageCleanupJobStatuses)[number]

export const detectedImageFormats = [
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
] as const
export type DetectedImageFormat = (typeof detectedImageFormats)[number]

export const fileCleanupJobKinds = ["exact", "owner_prefix"] as const
export type FileCleanupJobKind = (typeof fileCleanupJobKinds)[number]

export const fileCleanupJobStatuses = [
  "pending",
  "processing",
  "failed",
  "completed",
] as const
export type FileCleanupJobStatus = (typeof fileCleanupJobStatuses)[number]

export const organizationDeletionJobStatuses = [
  "pending",
  "processing",
  "failed",
  "completed",
] as const
export type OrganizationDeletionJobStatus =
  (typeof organizationDeletionJobStatuses)[number]

export const invitationEmailJobStatuses = [
  "pending",
  "processing",
  "failed",
  "completed",
  "canceled",
] as const
export type InvitationEmailJobStatus =
  (typeof invitationEmailJobStatuses)[number]

export const issues = sqliteTable(
  "issues",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<IssueStatus>().notNull().default("open"),
    priority: text("priority")
      .$type<IssuePriority>()
      .notNull()
      .default("no_priority"),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    labels: text("labels", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("issues_organization_number_uidx").on(
      table.organizationId,
      table.number
    ),
    uniqueIndex("issues_id_organization_uidx").on(
      table.id,
      table.organizationId
    ),
    index("issues_organization_status_idx").on(
      table.organizationId,
      table.status
    ),
    index("issues_organization_assignee_idx").on(
      table.organizationId,
      table.assigneeId
    ),
    index("issues_organization_creator_idx").on(
      table.organizationId,
      table.creatorId
    ),
    index("issues_organization_due_date_idx").on(
      table.organizationId,
      table.dueDate
    ),
  ]
)

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    uploaderId: text("uploader_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    uploadId: text("upload_id").notNull(),
    ownerType: text("owner_type").$type<FileOwnerType>().notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    declaredContentType: text("declared_content_type").notNull(),
    detectedImageFormat: text(
      "detected_image_format"
    ).$type<DetectedImageFormat>(),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    etag: text("etag"),
    status: text("status").$type<FileStatus>().notNull().default("pending"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("files_organization_upload_uidx").on(
      table.organizationId,
      table.uploadId
    ),
    uniqueIndex("files_object_key_uidx").on(table.objectKey),
    uniqueIndex("files_id_organization_owner_type_uidx").on(
      table.id,
      table.organizationId,
      table.ownerType
    ),
    index("files_organization_status_created_idx").on(
      table.organizationId,
      table.status,
      table.createdAt
    ),
    index("files_organization_uploader_idx").on(
      table.organizationId,
      table.uploaderId
    ),
    check("files_owner_type_check", sql`${table.ownerType} in ('issue')`),
    check("files_status_check", sql`${table.status} in ('pending', 'ready')`),
    check(
      "files_size_bytes_check",
      sql`${table.sizeBytes} between 0 and ${sql.raw(String(MAX_FILE_SIZE_BYTES))}`
    ),
    check(
      "files_filename_check",
      sql`length(${table.filename}) between 1 and 255`
    ),
    check(
      "files_declared_content_type_check",
      sql`length(${table.declaredContentType}) <= 255`
    ),
    check(
      "files_detected_image_format_check",
      sql`${table.detectedImageFormat} is null or ${table.detectedImageFormat} in ('jpeg', 'png', 'webp', 'gif', 'avif')`
    ),
    check(
      "files_image_dimensions_check",
      sql`(
        ${table.imageWidth} is null and ${table.imageHeight} is null
      ) or (
        ${table.imageWidth} > 0 and ${table.imageHeight} > 0
      )`
    ),
    check(
      "files_ready_etag_check",
      sql`${table.status} != 'ready' or length(${table.etag}) between 1 and 128`
    ),
  ]
)

export const issueFileOwners = sqliteTable(
  "issue_file_owners",
  {
    fileId: text("file_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    ownerType: text("owner_type").$type<"issue">().notNull().default("issue"),
    issueId: text("issue_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fileId, table.organizationId, table.ownerType],
      foreignColumns: [files.id, files.organizationId, files.ownerType],
      name: "issue_file_owners_file_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.issueId, table.organizationId],
      foreignColumns: [issues.id, issues.organizationId],
      name: "issue_file_owners_issue_tenant_fk",
    }).onDelete("cascade"),
    index("issue_file_owners_organization_issue_idx").on(
      table.organizationId,
      table.issueId
    ),
    check(
      "issue_file_owners_owner_type_check",
      sql`${table.ownerType} = 'issue'`
    ),
  ]
)

export const organizationFileUsage = sqliteTable(
  "organization_file_usage",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    usedBytes: integer("used_bytes").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "organization_file_usage_used_bytes_check",
      sql`${table.usedBytes} between 0 and ${sql.raw(String(ORGANIZATION_FILE_QUOTA_BYTES))}`
    ),
  ]
)

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

export const issueComments = sqliteTable(
  "issue_comments",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.issueId, table.organizationId],
      foreignColumns: [issues.id, issues.organizationId],
      name: "issue_comments_issue_tenant_fk",
    }).onDelete("cascade"),
    index("issue_comments_organization_issue_created_idx").on(
      table.organizationId,
      table.issueId,
      table.createdAt
    ),
    index("issue_comments_organization_author_idx").on(
      table.organizationId,
      table.authorId
    ),
  ]
)

export const issueActivityEvents = sqliteTable(
  "issue_activity_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    issueId: text("issue_id").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    batchId: text("batch_id").notNull(),
    position: integer("position").notNull().default(0),
    kind: text("kind").$type<IssueActivityKind>().notNull(),
    field: text("field").$type<IssueActivityField>(),
    fromValue: text("from_value", { mode: "json" }).$type<IssueActivityValue>(),
    toValue: text("to_value", { mode: "json" }).$type<IssueActivityValue>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.issueId, table.organizationId],
      foreignColumns: [issues.id, issues.organizationId],
      name: "issue_activity_events_issue_tenant_fk",
    }).onDelete("cascade"),
    index("issue_activity_events_issue_created_idx").on(
      table.organizationId,
      table.issueId,
      table.createdAt,
      table.position
    ),
  ]
)

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: text("metadata", { mode: "json" })
      .$type<AuditLogMetadata>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("audit_logs_organization_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("audit_logs_organization_action_created_idx").on(
      table.organizationId,
      table.action,
      table.createdAt
    ),
  ]
)

// recipient、token、URL、tenant/user IDはauth invitationから送信時に解決し、
// durable jobには再送制御に必要な非機密metadataだけを保存する。
export const invitationEmailJobs = sqliteTable(
  "invitation_email_jobs",
  {
    id: text("id").primaryKey(),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitation.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<InvitationEmailJobStatus>()
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
    uniqueIndex("invitation_email_jobs_invitation_uidx").on(table.invitationId),
    index("invitation_email_jobs_claim_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt
    ),
    check(
      "invitation_email_jobs_status_check",
      sql`${table.status} in ('pending', 'processing', 'failed', 'completed', 'canceled')`
    ),
    check("invitation_email_jobs_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "invitation_email_jobs_last_error_code_check",
      sql`${table.lastErrorCode} is null or (
        length(${table.lastErrorCode}) between 1 and 96
        and ${table.lastErrorCode} glob '[A-Za-z]*'
        and ${table.lastErrorCode} not glob '*[^A-Za-z0-9_.:-]*'
      )`
    ),
  ]
)

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
