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
import type {
  IssueStatus,
  IssuePriority,
  IssueActivityField,
  IssueActivityKind,
  IssueActivityValue,
  AuditLogMetadata,
} from "./values"

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
