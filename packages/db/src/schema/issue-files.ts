import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import { issues } from "./issues"
import { files } from "./storage"

export const issueFileOwners = sqliteTable(
  "issue_file_owners",
  {
    fileId: text("file_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    ownerType: text("owner_type").$type<"issue">().notNull().default("issue"),
    issueId: text("issue_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fileId, table.organizationId, table.ownerType],
      foreignColumns: [files.id, files.organizationId, files.ownerType],
      name: "issue_file_owners_file_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.issueId, table.organizationId],
      foreignColumns: [issues.id, issues.organizationId],
      name: "issue_file_owners_issue_tenant_fk",
    }).onDelete("cascade"),
    index("issue_file_owners_organization_issue_idx").on(
      table.organizationId,
      table.issueId
    ),
    uniqueIndex("issue_file_owners_file_organization_issue_uidx").on(
      table.fileId,
      table.organizationId,
      table.issueId
    ),
    check(
      "issue_file_owners_owner_type_check",
      sql`${table.ownerType} = 'issue'`
    ),
  ]
)

export const issueThumbnailSelections = sqliteTable(
  "issue_thumbnail_selections",
  {
    organizationId: text("organization_id").notNull(),
    issueId: text("issue_id").notNull(),
    fileId: text("file_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.issueId, table.organizationId],
      name: "issue_thumbnail_selections_issue_organization_pk",
    }),
    foreignKey({
      columns: [table.issueId, table.organizationId],
      foreignColumns: [issues.id, issues.organizationId],
      name: "issue_thumbnail_selections_issue_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.fileId, table.organizationId, table.issueId],
      foreignColumns: [
        issueFileOwners.fileId,
        issueFileOwners.organizationId,
        issueFileOwners.issueId,
      ],
      name: "issue_thumbnail_selections_file_owner_tenant_fk",
    }).onDelete("cascade"),
  ]
)
