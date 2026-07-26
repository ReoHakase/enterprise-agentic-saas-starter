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

import { organization, user } from "./auth.generated"
import { MAX_FILE_SIZE_BYTES, ORGANIZATION_FILE_QUOTA_BYTES } from "./values"
import type {
  FileOwnerType,
  FileStatus,
  DetectedImageFormat,
  StorageObjectKeyVersion,
  StorageObjectStatus,
  StorageObjectClaimHolderType,
} from "./values"

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
