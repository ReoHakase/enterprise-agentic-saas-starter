import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { invitation, organization, session, user } from "./auth.generated"

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
export const AGENT_ASSET_MAX_SIZE_BYTES = 10_000_000 as const
export const AGENT_RUN_MAX_ASSET_COUNT = 4 as const
export const AGENT_RUN_MAX_ASSET_BYTES = 20_000_000 as const
export const AGENT_ASSET_MAX_LIFETIME_MS = 604_800_000 as const
export const AGENT_ACTION_MAX_LIFETIME_MS = 900_000 as const
export const AGENT_RESUME_TICKET_MAX_LIFETIME_MS = 60_000 as const

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

export const agentThreadStatuses = ["active", "archived"] as const
export type AgentThreadStatus = (typeof agentThreadStatuses)[number]

export const agentThreadTitleStates = ["untitled", "agent"] as const
export type AgentThreadTitleState = (typeof agentThreadTitleStates)[number]

export const agentMessageRoles = ["user", "assistant"] as const
export type AgentMessageRole = (typeof agentMessageRoles)[number]
export type AgentMessageDocument = Record<string, unknown>

export const agentRunStatuses = [
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "canceled",
  "expired",
] as const
export type AgentRunStatus = (typeof agentRunStatuses)[number]

export const agentRunScopes = ["chat", "action_resume"] as const
export type AgentRunScope = (typeof agentRunScopes)[number]

export const agentGrantKinds = ["connection", "run"] as const
export type AgentGrantKind = (typeof agentGrantKinds)[number]

export const storageObjectKeyVersions = [1, 2] as const
export type StorageObjectKeyVersion = (typeof storageObjectKeyVersions)[number]

export const storageObjectStatuses = [
  "pending",
  "ready",
  "deleting",
  "deleted",
] as const
export type StorageObjectStatus = (typeof storageObjectStatuses)[number]

export const storageObjectClaimHolderTypes = [
  "agent_asset",
  "transferring",
  "file",
] as const
export type StorageObjectClaimHolderType =
  (typeof storageObjectClaimHolderTypes)[number]

export const agentAssetStatuses = [
  "pending",
  "ready",
  "promoting",
  "promoted",
  "expired",
  "deleted",
] as const
export type AgentAssetStatus = (typeof agentAssetStatuses)[number]

export const storageObjectCleanupJobStatuses = [
  "pending",
  "processing",
  "failed",
  "completed",
] as const
export type StorageObjectCleanupJobStatus =
  (typeof storageObjectCleanupJobStatuses)[number]

export const agentActionKinds = [
  "create_issue",
  "update_issue",
  "delete_issue",
] as const
export type AgentActionKind = (typeof agentActionKinds)[number]

export const agentActionStatuses = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "canceled",
  "succeeded",
  "conflicted",
] as const
export type AgentActionStatus = (typeof agentActionStatuses)[number]

export const agentDecisionProvenances = ["manual", "auto_policy"] as const
export type AgentDecisionProvenance = (typeof agentDecisionProvenances)[number]

export const agentApprovalPolicyModes = [
  "ask_each",
  "auto_write",
  "auto_all",
] as const
export type AgentApprovalPolicyMode = (typeof agentApprovalPolicyModes)[number]

export const agentResourceUsageKinds = [
  "asset_upload",
  "vision_transform",
  "write_action",
  "staged_asset",
  "pending_upload",
  "model_run",
  "web_search",
] as const
export type AgentResourceUsageKind = (typeof agentResourceUsageKinds)[number]

export type AgentActionDocument = Record<string, unknown>

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
    revision: integer("revision").notNull().default(1),
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
    check("issues_revision_check", sql`${table.revision} >= 1`),
  ]
)

export const storageObjects = sqliteTable(
  "storage_objects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    uploaderId: text("uploader_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    uploadId: text("upload_id").notNull(),
    objectKey: text("object_key"),
    sizeBytes: integer("size_bytes").notNull(),
    declaredContentType: text("declared_content_type").notNull(),
    detectedImageFormat: text(
      "detected_image_format"
    ).$type<DetectedImageFormat>(),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    etag: text("etag"),
    status: text("status")
      .$type<StorageObjectStatus>()
      .notNull()
      .default("pending"),
    keyVersion: integer("key_version")
      .$type<StorageObjectKeyVersion>()
      .notNull()
      .default(2),
    cleanupRevision: integer("cleanup_revision").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("storage_objects_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("storage_objects_organization_upload_uidx").on(
      table.organizationId,
      table.uploadId
    ),
    uniqueIndex("storage_objects_object_key_uidx")
      .on(table.objectKey)
      .where(sql`${table.objectKey} is not null`),
    index("storage_objects_organization_status_created_idx").on(
      table.organizationId,
      table.status,
      table.createdAt
    ),
    index("storage_objects_cleanup_idx").on(
      table.status,
      table.cleanupRevision,
      table.updatedAt
    ),
    index("storage_objects_uploader_idx").on(
      table.organizationId,
      table.uploaderId
    ),
    check(
      "storage_objects_upload_id_check",
      sql`length(${table.uploadId}) between 1 and 128`
    ),
    check(
      "storage_objects_size_bytes_check",
      sql`${table.sizeBytes} between 0 and ${sql.raw(String(MAX_FILE_SIZE_BYTES))}`
    ),
    check(
      "storage_objects_declared_content_type_check",
      sql`length(${table.declaredContentType}) <= 255`
    ),
    check(
      "storage_objects_detected_image_format_check",
      sql`${table.detectedImageFormat} is null or ${table.detectedImageFormat} in ('jpeg', 'png', 'webp', 'gif', 'avif')`
    ),
    check(
      "storage_objects_image_dimensions_check",
      sql`(
        ${table.imageWidth} is null and ${table.imageHeight} is null
      ) or (
        ${table.imageWidth} is not null
        and ${table.imageHeight} is not null
        and ${table.imageWidth} > 0
        and ${table.imageHeight} > 0
      )`
    ),
    check(
      "storage_objects_status_check",
      sql`${table.status} in ('pending', 'ready', 'deleting', 'deleted')`
    ),
    check(
      "storage_objects_object_key_check",
      sql`(
        ${table.status} = 'deleted'
        and ${table.objectKey} is null
      ) or (
        ${table.status} != 'deleted'
        and ${table.objectKey} is not null
        and length(${table.objectKey}) between 1 and 1024
      )`
    ),
    check(
      "storage_objects_ready_etag_check",
      sql`${table.status} != 'ready' or (
        ${table.etag} is not null
        and length(${table.etag}) between 1 and 128
      )`
    ),
    check(
      "storage_objects_key_version_check",
      sql`${table.keyVersion} in (1, 2)`
    ),
    check(
      "storage_objects_cleanup_revision_check",
      sql`${table.cleanupRevision} >= 0`
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
    storageObjectId: text("storage_object_id"),
    keyVersion: integer("key_version").$type<StorageObjectKeyVersion>(),
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
    uniqueIndex("files_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("files_storage_object_uidx")
      .on(table.storageObjectId)
      .where(sql`${table.storageObjectId} is not null`),
    index("files_organization_status_created_idx").on(
      table.organizationId,
      table.status,
      table.createdAt
    ),
    index("files_organization_uploader_idx").on(
      table.organizationId,
      table.uploaderId
    ),
    foreignKey({
      columns: [table.organizationId, table.storageObjectId],
      foreignColumns: [storageObjects.organizationId, storageObjects.id],
      name: "files_storage_object_tenant_fk",
    }),
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
    check(
      "files_storage_v2_check",
      sql`(
        ${table.storageObjectId} is null
        and ${table.keyVersion} is null
      ) or (
        ${table.storageObjectId} is not null
        and ${table.keyVersion} is not null
        and ${table.keyVersion} in (1, 2)
      )`
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
    temporaryBytes: integer("temporary_bytes").notNull().default(0),
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
    check(
      "organization_file_usage_temporary_bytes_check",
      sql`${table.temporaryBytes} between 0 and ${table.usedBytes}`
    ),
  ]
)

export const storageObjectClaims = sqliteTable(
  "storage_object_claims",
  {
    storageObjectId: text("storage_object_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    holderType: text("holder_type")
      .$type<StorageObjectClaimHolderType>()
      .notNull(),
    holderId: text("holder_id"),
    fromAssetId: text("from_asset_id"),
    toFileId: text("to_file_id"),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("storage_object_claims_holder_uidx")
      .on(table.organizationId, table.holderType, table.holderId)
      .where(sql`${table.holderType} in ('agent_asset', 'file')`),
    uniqueIndex("storage_object_claims_transfer_from_uidx")
      .on(table.organizationId, table.fromAssetId)
      .where(sql`${table.holderType} = 'transferring'`),
    uniqueIndex("storage_object_claims_transfer_to_uidx")
      .on(table.organizationId, table.toFileId)
      .where(sql`${table.holderType} = 'transferring'`),
    index("storage_object_claims_organization_holder_idx").on(
      table.organizationId,
      table.holderType,
      table.holderId
    ),
    foreignKey({
      columns: [table.organizationId, table.storageObjectId],
      foreignColumns: [storageObjects.organizationId, storageObjects.id],
      name: "storage_object_claims_object_tenant_fk",
    }).onDelete("cascade"),
    check(
      "storage_object_claims_holder_type_check",
      sql`${table.holderType} in ('agent_asset', 'transferring', 'file')`
    ),
    check(
      "storage_object_claims_shape_check",
      sql`(
        ${table.holderType} in ('agent_asset', 'file')
        and ${table.holderId} is not null
        and length(${table.holderId}) between 1 and 128
        and ${table.fromAssetId} is null
        and ${table.toFileId} is null
      ) or (
        ${table.holderType} = 'transferring'
        and ${table.holderId} is null
        and ${table.fromAssetId} is not null
        and length(${table.fromAssetId}) between 1 and 128
        and ${table.toFileId} is not null
        and length(${table.toFileId}) between 1 and 128
      )`
    ),
    check("storage_object_claims_revision_check", sql`${table.revision} >= 1`),
  ]
)

export const agentAssets = sqliteTable(
  "agent_assets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    contextEpoch: integer("context_epoch").notNull(),
    uploaderId: text("uploader_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    storageObjectId: text("storage_object_id"),
    filename: text("filename").notNull(),
    status: text("status")
      .$type<AgentAssetStatus>()
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    promotedFileId: text("promoted_file_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_assets_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("agent_assets_storage_object_uidx")
      .on(table.storageObjectId)
      .where(sql`${table.storageObjectId} is not null`),
    uniqueIndex("agent_assets_promoted_file_uidx")
      .on(table.promotedFileId)
      .where(sql`${table.promotedFileId} is not null`),
    index("agent_assets_thread_status_expiry_idx").on(
      table.organizationId,
      table.threadId,
      table.status,
      table.expiresAt
    ),
    index("agent_assets_cleanup_idx").on(table.status, table.expiresAt),
    foreignKey({
      columns: [table.organizationId, table.threadId],
      foreignColumns: [agentThreads.organizationId, agentThreads.id],
      name: "agent_assets_thread_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.storageObjectId],
      foreignColumns: [storageObjects.organizationId, storageObjects.id],
      name: "agent_assets_storage_object_tenant_fk",
    }),
    foreignKey({
      columns: [table.organizationId, table.promotedFileId],
      foreignColumns: [files.organizationId, files.id],
      name: "agent_assets_promoted_file_tenant_fk",
    }),
    check("agent_assets_epoch_check", sql`${table.contextEpoch} >= 1`),
    check(
      "agent_assets_session_id_check",
      sql`${table.sessionId} is null or length(${table.sessionId}) between 1 and 128`
    ),
    check(
      "agent_assets_filename_check",
      sql`length(${table.filename}) between 1 and 255`
    ),
    check(
      "agent_assets_status_check",
      sql`${table.status} in ('pending', 'ready', 'promoting', 'promoted', 'expired', 'deleted')`
    ),
    check(
      "agent_assets_state_shape_check",
      sql`(
        ${table.status} in ('pending', 'ready', 'promoting')
        and ${table.storageObjectId} is not null
        and ${table.promotedFileId} is null
      ) or (
        ${table.status} = 'promoted'
        and ${table.storageObjectId} is null
        and ${table.promotedFileId} is not null
      ) or (
        ${table.status} in ('expired', 'deleted')
        and ${table.storageObjectId} is null
        and ${table.promotedFileId} is null
      )`
    ),
    check(
      "agent_assets_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}
        and ${table.expiresAt} <= ${table.createdAt} + ${sql.raw(String(AGENT_ASSET_MAX_LIFETIME_MS))}`
    ),
  ]
)

export const agentRunAssets = sqliteTable(
  "agent_run_assets",
  {
    organizationId: text("organization_id").notNull(),
    runId: text("run_id").notNull(),
    assetId: text("asset_id").notNull(),
    storageObjectId: text("storage_object_id"),
    sourceEtag: text("source_etag").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.runId, table.assetId],
      name: "agent_run_assets_pk",
    }),
    index("agent_run_assets_organization_run_idx").on(
      table.organizationId,
      table.runId
    ),
    index("agent_run_assets_storage_object_idx").on(table.storageObjectId),
    foreignKey({
      columns: [table.organizationId, table.runId],
      foreignColumns: [agentRuns.organizationId, agentRuns.id],
      name: "agent_run_assets_run_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.assetId],
      foreignColumns: [agentAssets.organizationId, agentAssets.id],
      name: "agent_run_assets_asset_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.storageObjectId],
      foreignColumns: [storageObjects.organizationId, storageObjects.id],
      name: "agent_run_assets_storage_object_tenant_fk",
    }),
    check(
      "agent_run_assets_source_etag_check",
      sql`length(${table.sourceEtag}) between 1 and 128`
    ),
    check(
      "agent_run_assets_size_bytes_check",
      sql`${table.sizeBytes} between 0 and ${sql.raw(String(AGENT_ASSET_MAX_SIZE_BYTES))}`
    ),
  ]
)

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

export const agentSessionContexts = sqliteTable(
  "agent_session_contexts",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => session.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contextEpoch: integer("context_epoch").notNull().default(1),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_session_contexts_scope_uidx").on(
      table.sessionId,
      table.userId,
      table.contextEpoch
    ),
    index("agent_session_contexts_user_idx").on(table.userId),
    check(
      "agent_session_contexts_epoch_check",
      sql`${table.contextEpoch} >= 1`
    ),
  ]
)

export const agentThreads = sqliteTable(
  "agent_threads",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    titleState: text("title_state")
      .$type<AgentThreadTitleState>()
      .notNull()
      .default("untitled"),
    status: text("status")
      .$type<AgentThreadStatus>()
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_threads_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    index("agent_threads_owner_status_updated_idx").on(
      table.organizationId,
      table.ownerUserId,
      table.status,
      table.updatedAt
    ),
    check(
      "agent_threads_title_check",
      sql`length(${table.title}) between 1 and 120`
    ),
    check(
      "agent_threads_status_check",
      sql`${table.status} in ('active', 'archived')`
    ),
    check(
      "agent_threads_title_state_check",
      sql`${table.titleState} in ('untitled', 'agent')`
    ),
  ]
)

export const agentMessages = sqliteTable(
  "agent_messages",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    id: text("id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    clientMessageId: text("client_message_id"),
    role: text("role").$type<AgentMessageRole>().notNull(),
    content: text("content", { mode: "json" })
      .$type<AgentMessageDocument>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_messages_id_uidx").on(table.id),
    uniqueIndex("agent_messages_thread_client_message_uidx")
      .on(table.organizationId, table.threadId, table.clientMessageId)
      .where(sql`${table.clientMessageId} is not null`),
    index("agent_messages_thread_sequence_idx").on(
      table.organizationId,
      table.threadId,
      table.sequence
    ),
    foreignKey({
      columns: [table.organizationId, table.threadId],
      foreignColumns: [agentThreads.organizationId, agentThreads.id],
      name: "agent_messages_thread_tenant_fk",
    }).onDelete("cascade"),
    check(
      "agent_messages_role_check",
      sql`${table.role} in ('user', 'assistant')`
    ),
    check(
      "agent_messages_client_id_check",
      sql`(
        ${table.role} = 'user'
        and length(${table.clientMessageId}) between 1 and 128
      ) or (
        ${table.role} = 'assistant'
        and ${table.clientMessageId} is null
      )`
    ),
    check(
      "agent_messages_content_check",
      sql`json_valid(${table.content}) and length(${table.content}) between 2 and 131072`
    ),
  ]
)

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    rootRunId: text("root_run_id").notNull(),
    parentRunId: text("parent_run_id"),
    resumedActionId: text("resumed_action_id"),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contextEpoch: integer("context_epoch").notNull(),
    clientMessageId: text("client_message_id"),
    status: text("status").$type<AgentRunStatus>().notNull().default("running"),
    scope: text("scope").$type<AgentRunScope>().notNull().default("chat"),
    stepCount: integer("step_count").notNull().default(0),
    toolCount: integer("tool_count").notNull().default(0),
    writeCount: integer("write_count").notNull().default(0),
    inputTokenCount: integer("input_token_count").notNull().default(0),
    outputTokenCount: integer("output_token_count").notNull().default(0),
    modelProfileId: text("model_profile_id")
      .notNull()
      .default("openrouter-qwen3.6-flash"),
    contextWindowTokenCount: integer("context_window_token_count")
      .notNull()
      .default(1_000_000),
    estimatedInputTokenCount: integer("estimated_input_token_count")
      .notNull()
      .default(0),
    reservedOutputTokenCount: integer("reserved_output_token_count")
      .notNull()
      .default(4_096),
    attempt: integer("attempt").notNull().default(1),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    webSearchUsedAt: integer("web_search_used_at", {
      mode: "timestamp_ms",
    }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("agent_runs_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("agent_runs_action_scope_uidx").on(
      table.organizationId,
      table.id,
      table.threadId,
      table.sessionId,
      table.userId,
      table.contextEpoch
    ),
    uniqueIndex("agent_runs_usage_scope_uidx").on(
      table.organizationId,
      table.id,
      table.threadId
    ),
    uniqueIndex("agent_runs_thread_client_message_uidx")
      .on(table.threadId, table.clientMessageId)
      .where(sql`${table.clientMessageId} is not null`),
    index("agent_runs_thread_status_started_idx").on(
      table.organizationId,
      table.threadId,
      table.status,
      table.startedAt
    ),
    index("agent_runs_root_idx").on(table.organizationId, table.rootRunId),
    index("agent_runs_session_epoch_idx").on(
      table.sessionId,
      table.contextEpoch
    ),
    index("agent_runs_expiry_idx").on(table.status, table.expiresAt),
    foreignKey({
      columns: [table.organizationId, table.threadId],
      foreignColumns: [agentThreads.organizationId, agentThreads.id],
      name: "agent_runs_thread_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.rootRunId],
      foreignColumns: [table.organizationId, table.id],
      name: "agent_runs_root_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.parentRunId],
      foreignColumns: [table.organizationId, table.id],
      name: "agent_runs_parent_tenant_fk",
    }),
    check("agent_runs_epoch_check", sql`${table.contextEpoch} >= 1`),
    check(
      "agent_runs_status_check",
      sql`${table.status} in ('running', 'waiting_approval', 'completed', 'failed', 'canceled', 'expired')`
    ),
    check(
      "agent_runs_scope_check",
      sql`${table.scope} in ('chat', 'action_resume')`
    ),
    check(
      "agent_runs_client_message_check",
      sql`(
        ${table.scope} = 'chat'
        and length(${table.clientMessageId}) between 1 and 128
      ) or (
        ${table.scope} = 'action_resume'
        and ${table.clientMessageId} is null
      )`
    ),
    check(
      "agent_runs_chain_shape_check",
      sql`(
        ${table.rootRunId} = ${table.id}
        and ${table.parentRunId} is null
        and ${table.scope} = 'chat'
        and ${table.resumedActionId} is null
      ) or (
        ${table.rootRunId} != ${table.id}
        and ${table.parentRunId} is not null
        and ${table.scope} = 'action_resume'
        and length(${table.resumedActionId}) between 1 and 128
        and ${table.stepCount} = 0
        and ${table.toolCount} = 0
        and ${table.writeCount} = 0
        and ${table.inputTokenCount} = 0
        and ${table.outputTokenCount} = 0
      )`
    ),
    check(
      "agent_runs_counters_check",
      sql`${table.stepCount} >= 0
        and ${table.toolCount} >= 0
        and ${table.writeCount} >= 0
        and ${table.inputTokenCount} >= 0
        and ${table.outputTokenCount} >= 0
        and ${table.contextWindowTokenCount} >= 1
        and ${table.estimatedInputTokenCount} >= 0
        and ${table.reservedOutputTokenCount} >= 1
        and ${table.estimatedInputTokenCount} + ${table.reservedOutputTokenCount} <= ${table.contextWindowTokenCount}`
    ),
    check("agent_runs_attempt_check", sql`${table.attempt} >= 1`),
    check(
      "agent_runs_expiry_check",
      sql`${table.expiresAt} > ${table.startedAt}
        and ${table.expiresAt} <= ${table.startedAt} + 300000`
    ),
    check(
      "agent_runs_finished_at_check",
      sql`${table.finishedAt} is null or ${table.finishedAt} >= ${table.startedAt}`
    ),
    check(
      "agent_runs_web_search_used_at_check",
      sql`${table.webSearchUsedAt} is null or (
        ${table.webSearchUsedAt} >= ${table.startedAt}
        and ${table.webSearchUsedAt} <= ${table.expiresAt}
      )`
    ),
  ]
)

export const agentConnectionTickets = sqliteTable(
  "agent_connection_tickets",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contextEpoch: integer("context_epoch").notNull(),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("agent_connection_tickets_hash_uidx").on(table.tokenHash),
    index("agent_connection_tickets_expiry_idx").on(table.expiresAt),
    index("agent_connection_tickets_session_epoch_idx").on(
      table.sessionId,
      table.contextEpoch
    ),
    index("agent_connection_tickets_thread_idx").on(
      table.organizationId,
      table.threadId
    ),
    foreignKey({
      columns: [table.organizationId, table.threadId],
      foreignColumns: [agentThreads.organizationId, agentThreads.id],
      name: "agent_connection_tickets_thread_tenant_fk",
    }).onDelete("cascade"),
    check(
      "agent_connection_tickets_hash_check",
      sql`length(${table.tokenHash}) = 64
        and ${table.tokenHash} not glob '*[^0-9a-f]*'`
    ),
    check(
      "agent_connection_tickets_epoch_check",
      sql`${table.contextEpoch} >= 1`
    ),
    check(
      "agent_connection_tickets_expiry_check",
      sql`${table.expiresAt} > ${table.issuedAt}
        and ${table.expiresAt} <= ${table.issuedAt} + 60000`
    ),
    check(
      "agent_connection_tickets_terminal_check",
      sql`not (
        ${table.consumedAt} is not null
        and ${table.revokedAt} is not null
      )
      and (${table.consumedAt} is null or ${table.consumedAt} >= ${table.issuedAt})
      and (${table.revokedAt} is null or ${table.revokedAt} >= ${table.issuedAt})`
    ),
  ]
)

export const agentGrants = sqliteTable(
  "agent_grants",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    kind: text("kind").$type<AgentGrantKind>().notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    runId: text("run_id"),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contextEpoch: integer("context_epoch").notNull(),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("agent_grants_hash_uidx").on(table.tokenHash),
    index("agent_grants_expiry_idx").on(table.expiresAt),
    index("agent_grants_session_epoch_idx").on(
      table.sessionId,
      table.contextEpoch
    ),
    index("agent_grants_run_idx").on(table.organizationId, table.runId),
    foreignKey({
      columns: [table.organizationId, table.threadId],
      foreignColumns: [agentThreads.organizationId, agentThreads.id],
      name: "agent_grants_thread_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.runId],
      foreignColumns: [agentRuns.organizationId, agentRuns.id],
      name: "agent_grants_run_tenant_fk",
    }).onDelete("cascade"),
    check(
      "agent_grants_hash_check",
      sql`length(${table.tokenHash}) = 64
        and ${table.tokenHash} not glob '*[^0-9a-f]*'`
    ),
    check("agent_grants_epoch_check", sql`${table.contextEpoch} >= 1`),
    check(
      "agent_grants_kind_check",
      sql`${table.kind} in ('connection', 'run')`
    ),
    check(
      "agent_grants_run_kind_check",
      sql`(
        ${table.kind} = 'connection'
        and ${table.runId} is null
      ) or (
        ${table.kind} = 'run'
        and ${table.runId} is not null
      )`
    ),
    check(
      "agent_grants_expiry_check",
      sql`${table.expiresAt} > ${table.issuedAt}
        and ${table.expiresAt} <= ${table.issuedAt} + 300000`
    ),
    check(
      "agent_grants_revoked_at_check",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.issuedAt}`
    ),
  ]
)

export const agentApprovalPolicies = sqliteTable(
  "agent_approval_policies",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contextEpoch: integer("context_epoch").notNull(),
    mode: text("mode").$type<AgentApprovalPolicyMode>().notNull(),
    destructiveConfirmedAt: integer("destructive_confirmed_at", {
      mode: "timestamp_ms",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_approval_policies_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("agent_approval_policies_action_scope_uidx").on(
      table.organizationId,
      table.id,
      table.threadId,
      table.sessionId,
      table.userId,
      table.contextEpoch
    ),
    uniqueIndex("agent_approval_policies_active_scope_uidx")
      .on(table.sessionId, table.userId, table.organizationId, table.threadId)
      .where(sql`${table.revokedAt} is null`),
    index("agent_approval_policies_expiry_idx").on(
      table.revokedAt,
      table.expiresAt
    ),
    index("agent_approval_policies_session_epoch_idx").on(
      table.sessionId,
      table.contextEpoch
    ),
    foreignKey({
      columns: [table.organizationId, table.threadId],
      foreignColumns: [agentThreads.organizationId, agentThreads.id],
      name: "agent_approval_policies_thread_tenant_fk",
    }).onDelete("cascade"),
    check(
      "agent_approval_policies_mode_check",
      sql`${table.mode} in ('ask_each', 'auto_write', 'auto_all')`
    ),
    check(
      "agent_approval_policies_epoch_check",
      sql`${table.contextEpoch} >= 1`
    ),
    check(
      "agent_approval_policies_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}
        and ${table.expiresAt} <= ${table.createdAt} + ${sql.raw(String(AGENT_ACTION_MAX_LIFETIME_MS))}`
    ),
    check(
      "agent_approval_policies_destructive_check",
      sql`(
        ${table.mode} = 'auto_all'
        and ${table.destructiveConfirmedAt} is not null
        and ${table.destructiveConfirmedAt} >= ${table.createdAt}
        and ${table.destructiveConfirmedAt} <= ${table.expiresAt}
      ) or (
        ${table.mode} != 'auto_all'
        and ${table.destructiveConfirmedAt} is null
      )`
    ),
    check(
      "agent_approval_policies_revoked_at_check",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`
    ),
  ]
)

export const agentActions = sqliteTable(
  "agent_actions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    runId: text("run_id").notNull(),
    sessionId: text("session_id").notNull(),
    userId: text("user_id").notNull(),
    contextEpoch: integer("context_epoch").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    kind: text("kind").$type<AgentActionKind>().notNull(),
    normalizedPayload: text("normalized_payload", {
      mode: "json",
    }).$type<AgentActionDocument>(),
    canonicalPreview: text("canonical_preview", {
      mode: "json",
    }).$type<AgentActionDocument>(),
    targetType: text("target_type").$type<"issue">().notNull().default("issue"),
    targetId: text("target_id").notNull(),
    targetRevision: integer("target_revision"),
    status: text("status")
      .$type<AgentActionStatus>()
      .notNull()
      .default("pending"),
    decisionProvenance: text(
      "decision_provenance"
    ).$type<AgentDecisionProvenance>(),
    decisionPolicyId: text("decision_policy_id"),
    decisionIdempotencyKey: text("decision_idempotency_key"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    idempotencyKey: text("idempotency_key").notNull(),
    receipt: text("receipt", { mode: "json" }).$type<AgentActionDocument>(),
    resultId: text("result_id"),
    errorClassification: text("error_classification"),
    attempt: integer("attempt").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    scrubbedAt: integer("scrubbed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("agent_actions_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("agent_actions_resume_scope_uidx").on(
      table.organizationId,
      table.id,
      table.threadId,
      table.sessionId,
      table.userId,
      table.contextEpoch
    ),
    uniqueIndex("agent_actions_idempotency_uidx").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("agent_actions_run_tool_call_uidx").on(
      table.organizationId,
      table.runId,
      table.toolCallId
    ),
    uniqueIndex("agent_actions_decision_idempotency_uidx")
      .on(table.organizationId, table.decisionIdempotencyKey)
      .where(sql`${table.decisionIdempotencyKey} is not null`),
    index("agent_actions_thread_status_created_idx").on(
      table.organizationId,
      table.threadId,
      table.status,
      table.createdAt
    ),
    index("agent_actions_session_epoch_status_idx").on(
      table.sessionId,
      table.contextEpoch,
      table.status
    ),
    index("agent_actions_expiry_idx").on(table.status, table.expiresAt),
    index("agent_actions_target_idx").on(
      table.organizationId,
      table.targetType,
      table.targetId
    ),
    foreignKey({
      columns: [
        table.organizationId,
        table.runId,
        table.threadId,
        table.sessionId,
        table.userId,
        table.contextEpoch,
      ],
      foreignColumns: [
        agentRuns.organizationId,
        agentRuns.id,
        agentRuns.threadId,
        agentRuns.sessionId,
        agentRuns.userId,
        agentRuns.contextEpoch,
      ],
      name: "agent_actions_run_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.organizationId,
        table.decisionPolicyId,
        table.threadId,
        table.sessionId,
        table.userId,
        table.contextEpoch,
      ],
      foreignColumns: [
        agentApprovalPolicies.organizationId,
        agentApprovalPolicies.id,
        agentApprovalPolicies.threadId,
        agentApprovalPolicies.sessionId,
        agentApprovalPolicies.userId,
        agentApprovalPolicies.contextEpoch,
      ],
      name: "agent_actions_policy_scope_fk",
    }),
    check(
      "agent_actions_kind_check",
      sql`${table.kind} in ('create_issue', 'update_issue', 'delete_issue')`
    ),
    check(
      "agent_actions_status_check",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'expired', 'canceled', 'succeeded', 'conflicted')`
    ),
    check("agent_actions_epoch_check", sql`${table.contextEpoch} >= 1`),
    check(
      "agent_actions_tool_call_id_check",
      sql`length(${table.toolCallId}) between 1 and 128`
    ),
    check(
      "agent_actions_target_check",
      sql`${table.targetType} = 'issue'
        and length(${table.targetId}) between 1 and 128
        and (
          (${table.kind} = 'create_issue' and ${table.targetRevision} is null)
          or (
            ${table.kind} in ('update_issue', 'delete_issue')
            and ${table.targetRevision} is not null
            and ${table.targetRevision} >= 1
          )
        )`
    ),
    check(
      "agent_actions_payload_check",
      sql`(
        ${table.normalizedPayload} is not null
        and json_valid(${table.normalizedPayload})
        and ${table.canonicalPreview} is not null
        and json_valid(${table.canonicalPreview})
        and ${table.scrubbedAt} is null
      ) or (
        ${table.normalizedPayload} is null
        and ${table.canonicalPreview} is null
        and ${table.scrubbedAt} is not null
        and ${table.status} in ('rejected', 'expired', 'canceled', 'succeeded', 'conflicted')
      )`
    ),
    check(
      "agent_actions_decision_check",
      sql`(
        ${table.decisionProvenance} is null
        and ${table.decisionPolicyId} is null
        and ${table.decisionIdempotencyKey} is null
        and ${table.decidedAt} is null
      ) or (
        ${table.decisionProvenance} = 'manual'
        and ${table.decisionPolicyId} is null
        and ${table.decisionIdempotencyKey} is not null
        and length(${table.decisionIdempotencyKey}) between 1 and 128
        and ${table.decidedAt} is not null
      ) or (
        ${table.decisionProvenance} = 'auto_policy'
        and ${table.decisionPolicyId} is not null
        and ${table.decisionIdempotencyKey} is null
        and ${table.decidedAt} is not null
      )`
    ),
    check(
      "agent_actions_status_shape_check",
      sql`(
        ${table.status} = 'pending'
        and ${table.decisionProvenance} is null
        and ${table.completedAt} is null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is null
      ) or (
        ${table.status} = 'approved'
        and ${table.decisionProvenance} is not null
        and ${table.completedAt} is null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is null
      ) or (
        ${table.status} = 'rejected'
        and ${table.decisionProvenance} = 'manual'
        and ${table.completedAt} is not null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is null
      ) or (
        ${table.status} in ('expired', 'canceled')
        and ${table.completedAt} is not null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is null
      ) or (
        ${table.status} = 'conflicted'
        and ${table.decisionProvenance} is not null
        and ${table.completedAt} is not null
        and ${table.receipt} is null
        and ${table.resultId} is null
        and ${table.errorClassification} is not null
      ) or (
        ${table.status} = 'succeeded'
        and ${table.decisionProvenance} is not null
        and ${table.completedAt} is not null
        and ${table.receipt} is not null
        and json_valid(${table.receipt})
        and ${table.resultId} is not null
        and ${table.errorClassification} is null
      )`
    ),
    check(
      "agent_actions_idempotency_key_check",
      sql`length(${table.idempotencyKey}) between 1 and 128`
    ),
    check(
      "agent_actions_result_id_check",
      sql`${table.resultId} is null or length(${table.resultId}) between 1 and 128`
    ),
    check(
      "agent_actions_error_classification_check",
      sql`${table.errorClassification} is null or (
        length(${table.errorClassification}) between 1 and 96
        and ${table.errorClassification} glob '[A-Za-z]*'
        and ${table.errorClassification} not glob '*[^A-Za-z0-9_.:-]*'
      )`
    ),
    check("agent_actions_attempt_check", sql`${table.attempt} >= 0`),
    check(
      "agent_actions_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}
        and ${table.expiresAt} <= ${table.createdAt} + ${sql.raw(String(AGENT_ACTION_MAX_LIFETIME_MS))}`
    ),
    check(
      "agent_actions_timestamps_check",
      sql`(${table.decidedAt} is null or (
          ${table.decidedAt} >= ${table.createdAt}
          and ${table.decidedAt} <= ${table.expiresAt}
        ))
        and (${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt})
        and (${table.scrubbedAt} is null or (
          ${table.completedAt} is not null
          and ${table.scrubbedAt} >= ${table.completedAt}
        ))`
    ),
  ]
)

export const agentResumeTickets = sqliteTable(
  "agent_resume_tickets",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    actionId: text("action_id").notNull(),
    organizationId: text("organization_id").notNull(),
    threadId: text("thread_id").notNull(),
    sessionId: text("session_id").notNull(),
    userId: text("user_id").notNull(),
    contextEpoch: integer("context_epoch").notNull(),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("agent_resume_tickets_hash_uidx").on(table.tokenHash),
    uniqueIndex("agent_resume_tickets_active_action_uidx")
      .on(table.organizationId, table.actionId)
      .where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
    index("agent_resume_tickets_expiry_idx").on(table.expiresAt),
    index("agent_resume_tickets_action_idx").on(
      table.organizationId,
      table.actionId
    ),
    index("agent_resume_tickets_session_epoch_idx").on(
      table.sessionId,
      table.contextEpoch
    ),
    foreignKey({
      columns: [
        table.organizationId,
        table.actionId,
        table.threadId,
        table.sessionId,
        table.userId,
        table.contextEpoch,
      ],
      foreignColumns: [
        agentActions.organizationId,
        agentActions.id,
        agentActions.threadId,
        agentActions.sessionId,
        agentActions.userId,
        agentActions.contextEpoch,
      ],
      name: "agent_resume_tickets_action_scope_fk",
    }).onDelete("cascade"),
    check(
      "agent_resume_tickets_hash_check",
      sql`length(${table.tokenHash}) = 64
        and ${table.tokenHash} not glob '*[^0-9a-f]*'`
    ),
    check("agent_resume_tickets_epoch_check", sql`${table.contextEpoch} >= 1`),
    check(
      "agent_resume_tickets_expiry_check",
      sql`${table.expiresAt} > ${table.issuedAt}
        and ${table.expiresAt} <= ${table.issuedAt} + ${sql.raw(String(AGENT_RESUME_TICKET_MAX_LIFETIME_MS))}`
    ),
    check(
      "agent_resume_tickets_terminal_check",
      sql`not (
        ${table.consumedAt} is not null
        and ${table.revokedAt} is not null
      )
      and (${table.consumedAt} is null or ${table.consumedAt} >= ${table.issuedAt})
      and (${table.revokedAt} is null or ${table.revokedAt} >= ${table.issuedAt})`
    ),
  ]
)

export const agentActionAssets = sqliteTable(
  "agent_action_assets",
  {
    organizationId: text("organization_id").notNull(),
    actionId: text("action_id").notNull(),
    assetId: text("asset_id").notNull(),
    storageObjectId: text("storage_object_id"),
    sourceEtag: text("source_etag").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    leaseExpiresAt: integer("lease_expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
    releasedAt: integer("released_at", { mode: "timestamp_ms" }),
    quotaClassifiedAt: integer("quota_classified_at", {
      mode: "timestamp_ms",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.actionId, table.assetId],
      name: "agent_action_assets_pk",
    }),
    uniqueIndex("agent_action_assets_active_asset_uidx")
      .on(table.assetId)
      .where(sql`${table.releasedAt} is null`),
    index("agent_action_assets_organization_action_idx").on(
      table.organizationId,
      table.actionId
    ),
    index("agent_action_assets_active_lease_idx").on(
      table.releasedAt,
      table.leaseExpiresAt
    ),
    index("agent_action_assets_storage_object_idx").on(table.storageObjectId),
    foreignKey({
      columns: [table.organizationId, table.actionId],
      foreignColumns: [agentActions.organizationId, agentActions.id],
      name: "agent_action_assets_action_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.assetId],
      foreignColumns: [agentAssets.organizationId, agentAssets.id],
      name: "agent_action_assets_asset_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.storageObjectId],
      foreignColumns: [storageObjects.organizationId, storageObjects.id],
      name: "agent_action_assets_storage_object_tenant_fk",
    }),
    check(
      "agent_action_assets_source_etag_check",
      sql`length(${table.sourceEtag}) between 1 and 128`
    ),
    check(
      "agent_action_assets_size_bytes_check",
      sql`${table.sizeBytes} between 0 and ${sql.raw(String(AGENT_ASSET_MAX_SIZE_BYTES))}`
    ),
    check(
      "agent_action_assets_lease_check",
      sql`${table.leaseExpiresAt} > ${table.createdAt}
        and (${table.releasedAt} is null or ${table.releasedAt} >= ${table.createdAt})
        and (${table.quotaClassifiedAt} is null or (
          ${table.quotaClassifiedAt} >= ${table.createdAt}
          and (${table.releasedAt} is null or ${table.quotaClassifiedAt} <= ${table.releasedAt})
        ))`
    ),
    check(
      "agent_action_assets_storage_state_check",
      sql`${table.storageObjectId} is not null or ${table.releasedAt} is not null`
    ),
  ]
)

export const agentUsageEvents = sqliteTable(
  "agent_usage_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    runId: text("run_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokenCount: integer("input_token_count").notNull().default(0),
    inputNoCacheTokenCount: integer("input_no_cache_token_count")
      .notNull()
      .default(0),
    cacheReadTokenCount: integer("cache_read_token_count").notNull().default(0),
    cacheWriteTokenCount: integer("cache_write_token_count")
      .notNull()
      .default(0),
    outputTokenCount: integer("output_token_count").notNull().default(0),
    textOutputTokenCount: integer("text_output_token_count")
      .notNull()
      .default(0),
    reasoningTokenCount: integer("reasoning_token_count").notNull().default(0),
    totalTokenCount: integer("total_token_count").notNull().default(0),
    imageInputCount: integer("image_input_count").notNull().default(0),
    calculatedCostMicros: integer("calculated_cost_micros")
      .notNull()
      .default(0),
    providerCostMicros: integer("provider_cost_micros"),
    pricingVersion: text("pricing_version").notNull().default("unpriced"),
    currency: text("currency").notNull().default("USD"),
    isEstimate: integer("is_estimate", { mode: "boolean" })
      .notNull()
      .default(false),
    durationMs: integer("duration_ms").notNull(),
    providerRequestId: text("provider_request_id"),
    runEventId: text("run_event_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_usage_events_provider_request_uidx")
      .on(table.organizationId, table.provider, table.providerRequestId)
      .where(sql`${table.providerRequestId} is not null`),
    uniqueIndex("agent_usage_events_run_event_uidx")
      .on(table.organizationId, table.runId, table.runEventId)
      .where(sql`${table.runEventId} is not null`),
    index("agent_usage_events_run_created_idx").on(
      table.organizationId,
      table.runId,
      table.createdAt
    ),
    foreignKey({
      columns: [table.organizationId, table.runId, table.threadId],
      foreignColumns: [
        agentRuns.organizationId,
        agentRuns.id,
        agentRuns.threadId,
      ],
      name: "agent_usage_events_run_scope_fk",
    }).onDelete("cascade"),
    check(
      "agent_usage_events_provider_check",
      sql`length(${table.provider}) between 1 and 64`
    ),
    check(
      "agent_usage_events_model_check",
      sql`length(${table.model}) between 1 and 160`
    ),
    check(
      "agent_usage_events_counts_check",
      sql`${table.inputTokenCount} >= 0
        and ${table.inputNoCacheTokenCount} >= 0
        and ${table.cacheReadTokenCount} >= 0
        and ${table.cacheWriteTokenCount} >= 0
        and ${table.outputTokenCount} >= 0
        and ${table.textOutputTokenCount} >= 0
        and ${table.reasoningTokenCount} >= 0
        and ${table.totalTokenCount} >= 0
        and ${table.imageInputCount} >= 0
        and ${table.calculatedCostMicros} >= 0
        and (${table.providerCostMicros} is null or ${table.providerCostMicros} >= 0)
        and ${table.durationMs} between 0 and 300000`
    ),
    check(
      "agent_usage_events_token_shape_check",
      sql`${table.inputNoCacheTokenCount} + ${table.cacheReadTokenCount} + ${table.cacheWriteTokenCount} <= ${table.inputTokenCount}
        and ${table.textOutputTokenCount} + ${table.reasoningTokenCount} <= ${table.outputTokenCount}
        and ${table.totalTokenCount} = ${table.inputTokenCount} + ${table.outputTokenCount}`
    ),
    check(
      "agent_usage_events_billing_check",
      sql`length(${table.pricingVersion}) between 1 and 160
        and ${table.currency} = 'USD'`
    ),
    check(
      "agent_usage_events_idempotency_check",
      sql`(
        ${table.providerRequestId} is not null
        and length(${table.providerRequestId}) between 1 and 160
      ) or (
        ${table.runEventId} is not null
        and length(${table.runEventId}) between 1 and 160
      )`
    ),
  ]
)

export const agentThreadContextSummaries = sqliteTable(
  "agent_thread_context_summaries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    throughSequence: integer("through_sequence").notNull(),
    summary: text("summary").notNull(),
    estimatedTokenCount: integer("estimated_token_count").notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_thread_context_summaries_scope_uidx").on(
      table.organizationId,
      table.threadId,
      table.throughSequence
    ),
    index("agent_thread_context_summaries_latest_idx").on(
      table.organizationId,
      table.threadId,
      table.createdAt
    ),
    foreignKey({
      columns: [table.organizationId, table.threadId],
      foreignColumns: [agentThreads.organizationId, agentThreads.id],
      name: "agent_thread_context_summaries_thread_tenant_fk",
    }).onDelete("cascade"),
    check(
      "agent_thread_context_summaries_content_check",
      sql`${table.throughSequence} >= 1
        and length(${table.summary}) between 1 and 50000
        and ${table.estimatedTokenCount} >= 1
        and length(${table.model}) between 1 and 160`
    ),
  ]
)

export const agentModelPrices = sqliteTable(
  "agent_model_prices",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    pricingVersion: text("pricing_version").notNull(),
    effectiveFrom: integer("effective_from", {
      mode: "timestamp_ms",
    }).notNull(),
    effectiveTo: integer("effective_to", { mode: "timestamp_ms" }),
    inputPriceMicrosPerMillion: integer(
      "input_price_micros_per_million"
    ).notNull(),
    cacheReadPriceMicrosPerMillion: integer(
      "cache_read_price_micros_per_million"
    ).notNull(),
    cacheWritePriceMicrosPerMillion: integer(
      "cache_write_price_micros_per_million"
    ).notNull(),
    outputPriceMicrosPerMillion: integer(
      "output_price_micros_per_million"
    ).notNull(),
    currency: text("currency").notNull().default("USD"),
  },
  (table) => [
    uniqueIndex("agent_model_prices_version_uidx").on(
      table.provider,
      table.model,
      table.pricingVersion
    ),
    index("agent_model_prices_effective_idx").on(
      table.provider,
      table.model,
      table.effectiveFrom
    ),
    check(
      "agent_model_prices_values_check",
      sql`length(${table.provider}) between 1 and 64
        and length(${table.model}) between 1 and 160
        and length(${table.pricingVersion}) between 1 and 160
        and (${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom})
        and ${table.inputPriceMicrosPerMillion} >= 0
        and ${table.cacheReadPriceMicrosPerMillion} >= 0
        and ${table.cacheWritePriceMicrosPerMillion} >= 0
        and ${table.outputPriceMicrosPerMillion} >= 0
        and ${table.currency} = 'USD'`
    ),
  ]
)

export const agentUsageDaily = sqliteTable(
  "agent_usage_daily",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    runCount: integer("run_count").notNull().default(0),
    inputTokenCount: integer("input_token_count").notNull().default(0),
    outputTokenCount: integer("output_token_count").notNull().default(0),
    reasoningTokenCount: integer("reasoning_token_count").notNull().default(0),
    totalTokenCount: integer("total_token_count").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_usage_daily_scope_uidx").on(
      table.date,
      table.organizationId,
      table.userId,
      table.provider,
      table.model
    ),
    index("agent_usage_daily_organization_date_idx").on(
      table.organizationId,
      table.date
    ),
    check(
      "agent_usage_daily_values_check",
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        and length(${table.provider}) between 1 and 64
        and length(${table.model}) between 1 and 160
        and ${table.runCount} >= 0
        and ${table.inputTokenCount} >= 0
        and ${table.outputTokenCount} >= 0
        and ${table.reasoningTokenCount} >= 0
        and ${table.totalTokenCount} = ${table.inputTokenCount} + ${table.outputTokenCount}
        and ${table.costMicros} >= 0`
    ),
  ]
)

export const agentResourceUsageBuckets = sqliteTable(
  "agent_resource_usage_buckets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").$type<AgentResourceUsageKind>().notNull(),
    windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
    windowEnd: integer("window_end", { mode: "timestamp_ms" }).notNull(),
    count: integer("count").notNull().default(0),
    limitCount: integer("limit_count").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_resource_usage_buckets_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    uniqueIndex("agent_resource_usage_buckets_organization_scope_uidx")
      .on(table.organizationId, table.kind, table.windowStart)
      .where(sql`${table.userId} is null`),
    uniqueIndex("agent_resource_usage_buckets_user_scope_uidx")
      .on(table.organizationId, table.userId, table.kind, table.windowStart)
      .where(sql`${table.userId} is not null`),
    index("agent_resource_usage_buckets_window_end_idx").on(table.windowEnd),
    check(
      "agent_resource_usage_buckets_kind_check",
      sql`${table.kind} in ('asset_upload', 'vision_transform', 'write_action', 'staged_asset', 'pending_upload', 'model_run', 'web_search')`
    ),
    check(
      "agent_resource_usage_buckets_window_check",
      sql`${table.windowEnd} > ${table.windowStart}`
    ),
    check(
      "agent_resource_usage_buckets_count_check",
      sql`${table.limitCount} >= 0 and ${table.count} between 0 and ${table.limitCount}`
    ),
  ]
)

export const agentResourceUsageOperations = sqliteTable(
  "agent_resource_usage_operations",
  {
    operationId: text("operation_id").notNull(),
    organizationId: text("organization_id").notNull(),
    bucketId: text("bucket_id").notNull(),
    delta: integer("delta").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.bucketId, table.operationId],
      name: "agent_resource_usage_operations_pk",
    }),
    index("agent_resource_usage_operations_bucket_created_idx").on(
      table.organizationId,
      table.bucketId,
      table.createdAt
    ),
    foreignKey({
      columns: [table.organizationId, table.bucketId],
      foreignColumns: [
        agentResourceUsageBuckets.organizationId,
        agentResourceUsageBuckets.id,
      ],
      name: "agent_resource_usage_operations_bucket_tenant_fk",
    }).onDelete("cascade"),
    check(
      "agent_resource_usage_operations_id_check",
      sql`length(${table.operationId}) between 1 and 160`
    ),
    check(
      "agent_resource_usage_operations_delta_check",
      sql`${table.delta} between -${sql.raw(String(ORGANIZATION_FILE_QUOTA_BYTES))} and ${sql.raw(String(ORGANIZATION_FILE_QUOTA_BYTES))}
        and ${table.delta} != 0`
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
