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
import type { AgentRunStatus, AgentRunScope, AgentGrantKind } from "./values"

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
