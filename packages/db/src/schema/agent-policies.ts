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

import { agentThreads } from "./agent-threads"
import { organization, session, user } from "./auth.generated"
import { AGENT_ACTION_MAX_LIFETIME_MS } from "./values"
import type {
  AgentApprovalPolicyMode,
  AgentThreadPermissionMode,
} from "./values"

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

export const agentThreadPermissions = sqliteTable(
  "agent_thread_permissions",
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
    mode: text("mode").$type<AgentThreadPermissionMode>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_thread_permissions_scope_uidx").on(
      table.sessionId,
      table.userId,
      table.organizationId,
      table.threadId
    ),
    index("agent_thread_permissions_session_epoch_idx").on(
      table.sessionId,
      table.contextEpoch
    ),
    foreignKey({
      columns: [table.organizationId, table.threadId],
      foreignColumns: [agentThreads.organizationId, agentThreads.id],
      name: "agent_thread_permissions_thread_tenant_fk",
    }).onDelete("cascade"),
    check(
      "agent_thread_permissions_mode_check",
      sql`${table.mode} in ('ask_always', 'full_access')`
    ),
    check(
      "agent_thread_permissions_epoch_check",
      sql`${table.contextEpoch} >= 1`
    ),
  ]
)
