import { sql } from "drizzle-orm"
import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { organization, user } from "./auth.generated"

export const todoStatuses = ["open", "in_progress", "closed"] as const
export type TodoStatus = (typeof todoStatuses)[number]

export const todoPriorities = [
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const
export type TodoPriority = (typeof todoPriorities)[number]

export type AuditLogMetadata = Record<string, string | number | boolean | null>

export const todos = sqliteTable(
  "todos",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<TodoStatus>().notNull().default("open"),
    priority: text("priority")
      .$type<TodoPriority>()
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
    uniqueIndex("todos_organization_number_uidx").on(
      table.organizationId,
      table.number
    ),
    uniqueIndex("todos_id_organization_uidx").on(
      table.id,
      table.organizationId
    ),
    index("todos_organization_status_idx").on(
      table.organizationId,
      table.status
    ),
    index("todos_organization_assignee_idx").on(
      table.organizationId,
      table.assigneeId
    ),
    index("todos_organization_creator_idx").on(
      table.organizationId,
      table.creatorId
    ),
    index("todos_organization_due_date_idx").on(
      table.organizationId,
      table.dueDate
    ),
  ]
)

export const todoComments = sqliteTable(
  "todo_comments",
  {
    id: text("id").primaryKey(),
    todoId: text("todo_id").notNull(),
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
      columns: [table.todoId, table.organizationId],
      foreignColumns: [todos.id, todos.organizationId],
      name: "todo_comments_todo_tenant_fk",
    }).onDelete("cascade"),
    index("todo_comments_organization_todo_created_idx").on(
      table.organizationId,
      table.todoId,
      table.createdAt
    ),
    index("todo_comments_organization_author_idx").on(
      table.organizationId,
      table.authorId
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
