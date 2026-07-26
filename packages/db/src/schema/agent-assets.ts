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

import { agentActions } from "./agent-actions"
import { agentRuns } from "./agent-runs"
import { agentThreads } from "./agent-threads"
import { organization, session, user } from "./auth.generated"
import { storageObjects, files } from "./storage"
import {
  AGENT_ASSET_MAX_SIZE_BYTES,
  AGENT_ASSET_MAX_LIFETIME_MS,
} from "./values"
import type { AgentAssetStatus } from "./values"

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
