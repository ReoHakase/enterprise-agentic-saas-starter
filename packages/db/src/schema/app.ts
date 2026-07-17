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

import { invitation, organization, user } from "./auth.generated"

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
export type IssueActivityValue = string | string[] | null

export type AuditLogMetadata = Record<string, string | number | boolean | null>

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
    kind: text("kind")
      .$type<"created" | "field_changed" | "legacy_updated">()
      .notNull(),
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
