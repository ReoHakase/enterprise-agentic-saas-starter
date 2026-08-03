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
import { oauthClient } from "./oauth-provider"
import { storageObjects } from "./storage"

export type McpToolOperationReceipt = Record<string, unknown>

export const mcpToolOperations = sqliteTable(
  "mcp_tool_operations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    receipt: text("receipt", { mode: "json" })
      .$type<McpToolOperationReceipt>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("mcp_tool_operations_idempotency_uidx").on(
      table.organizationId,
      table.userId,
      table.clientId,
      table.toolName,
      table.idempotencyKey
    ),
    index("mcp_tool_operations_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
    check(
      "mcp_tool_operations_tool_name_check",
      sql`length(${table.toolName}) between 1 and 96`
    ),
    check(
      "mcp_tool_operations_idempotency_key_check",
      sql`length(${table.idempotencyKey}) between 16 and 128`
    ),
    check(
      "mcp_tool_operations_payload_digest_check",
      sql`length(${table.payloadDigest}) = 64 and ${table.payloadDigest} not glob '*[^0-9a-f]*'`
    ),
    check(
      "mcp_tool_operations_receipt_check",
      sql`json_valid(${table.receipt}) and json_type(${table.receipt}) = 'object'`
    ),
  ]
)

export const mcpAttachmentUploads = sqliteTable(
  "mcp_attachment_uploads",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    storageObjectId: text("storage_object_id").notNull(),
    filename: text("filename").notNull(),
    status: text("status")
      .$type<"pending" | "ready" | "consumed" | "expired">()
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("mcp_attachment_uploads_storage_object_uidx").on(
      table.storageObjectId
    ),
    index("mcp_attachment_uploads_owner_status_idx").on(
      table.organizationId,
      table.userId,
      table.clientId,
      table.status,
      table.expiresAt
    ),
    foreignKey({
      columns: [table.organizationId, table.storageObjectId],
      foreignColumns: [storageObjects.organizationId, storageObjects.id],
      name: "mcp_attachment_uploads_storage_tenant_fk",
    }),
    check(
      "mcp_attachment_uploads_filename_check",
      sql`length(${table.filename}) between 1 and 255`
    ),
    check(
      "mcp_attachment_uploads_status_check",
      sql`${table.status} in ('pending', 'ready', 'consumed', 'expired')`
    ),
    check(
      "mcp_attachment_uploads_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt} and ${table.expiresAt} <= ${table.createdAt} + 900000`
    ),
    check(
      "mcp_attachment_uploads_consumed_at_check",
      sql`(${table.status} = 'consumed' and ${table.consumedAt} is not null) or (${table.status} != 'consumed' and ${table.consumedAt} is null)`
    ),
  ]
)
