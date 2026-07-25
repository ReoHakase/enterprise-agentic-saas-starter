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

import { organization, session, user } from "./auth.generated"
import type {
  AgentThreadStatus,
  AgentThreadTitleState,
  AgentMessageRole,
  AgentMessageDocument,
} from "./values"

const agentLegacyThreadTitleStates = ["untitled", "agent"] as const
type AgentLegacyThreadTitleState = (typeof agentLegacyThreadTitleStates)[number]

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
    legacyTitleState: text("title_state")
      .$type<AgentLegacyThreadTitleState>()
      .notNull()
      .default("untitled"),
    titleState: text("title_state_v2")
      .$type<AgentThreadTitleState>()
      .notNull()
      .default("untitled"),
    titleRevision: integer("title_revision").notNull().default(1),
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
      sql`${table.legacyTitleState} in ('untitled', 'agent')`
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
