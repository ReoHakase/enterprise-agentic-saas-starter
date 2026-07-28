import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { organization, session, user } from "./auth.generated"
import type { AgentThreadStatus } from "./values"

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
    status: text("status")
      .$type<AgentThreadStatus>()
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("agent_threads_organization_id_uidx").on(
      table.organizationId,
      table.id
    ),
    index("agent_threads_owner_status_created_idx").on(
      table.organizationId,
      table.ownerUserId,
      table.status,
      table.createdAt
    ),
    check(
      "agent_threads_status_check",
      sql`${table.status} in ('active', 'archived')`
    ),
    check(
      "agent_threads_archive_check",
      sql`(${table.status} = 'active' and ${table.archivedAt} is null)
        or (${table.status} = 'archived' and ${table.archivedAt} is not null)`
    ),
  ]
)
