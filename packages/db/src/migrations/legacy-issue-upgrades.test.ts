import { rm } from "node:fs/promises"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import {
  applyBaselineSchema,
  createMigrationPrefix,
  migrationsFolder,
} from "./helpers"
describe("database migrations: legacy issue upgrades", () => {
  it("preserves legacy todos while converting completed to status", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await applyBaselineSchema(client)

      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-1", "Owner", "owner@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-1", "Org", "org", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["member-1", "org-1", "user-1", "owner", now],
        },
        {
          sql: "insert into todos(id,organization_id,title,completed,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["todo-open", "org-1", "Open", 0, now, now],
        },
        {
          sql: "insert into todos(id,organization_id,title,completed,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["todo-closed", "org-1", "Closed", 1, now + 1, now + 1],
        },
      ])

      await migrate(drizzle(client), { migrationsFolder })

      const issues = await client.execute(
        "select id, number, status, creator_id as creatorId, labels from issues order by number"
      )
      const members = await client.execute(
        "select role from member where id = 'member-1'"
      )
      expect(issues.rows).toMatchObject([
        {
          id: "todo-open",
          number: 1,
          status: "open",
          creatorId: "user-1",
          labels: "[]",
        },
        {
          id: "todo-closed",
          number: 2,
          status: "closed",
          creatorId: "user-1",
          labels: "[]",
        },
      ])
      expect(members.rows).toMatchObject([{ role: "owner" }])
    } finally {
      client.close()
    }
  })

  it("renames legacy issue data and backfills audit activity safely", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0008_optimal_gideon",
    })

    try {
      await migrate(drizzle(client), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["issue-owner", "Owner", "owner@issue.test", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["issue-org", "Issue Org", "issue-org", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "issue-member",
            "issue-org",
            "issue-owner",
            "super_admin",
            now,
          ],
        },
        {
          sql: "insert into todos(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "legacy-issue",
            "issue-org",
            7,
            "Legacy issue",
            "issue-owner",
            now,
            now,
          ],
        },
        {
          sql: "insert into todo_comments(id,todo_id,organization_id,author_id,body,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "legacy-comment",
            "legacy-issue",
            "issue-org",
            "issue-owner",
            "Preserved",
            now,
            now,
          ],
        },
        {
          sql: "insert into audit_logs(id,organization_id,actor_user_id,action,target_type,target_id,metadata,created_at) values(?,?,?,?,?,?,?,?)",
          args: [
            "legacy-created",
            "issue-org",
            "issue-owner",
            "todo.created",
            "todo",
            "legacy-issue",
            '{"todoId":"legacy-issue"}',
            now,
          ],
        },
        {
          sql: "insert into audit_logs(id,organization_id,actor_user_id,action,target_type,target_id,metadata,created_at) values(?,?,?,?,?,?,?,?)",
          args: [
            "legacy-updated",
            "issue-org",
            "issue-owner",
            "todo.updated",
            "todo",
            "legacy-issue",
            '{"todoId":"legacy-issue"}',
            now + 1,
          ],
        },
      ])

      await migrate(drizzle(client), { migrationsFolder })

      const comments = await client.execute(
        "select issue_id as issueId, body from issue_comments where id = 'legacy-comment'"
      )
      const activities = await client.execute(
        "select kind, field, from_value as fromValue, to_value as toValue from issue_activity_events where issue_id = 'legacy-issue' order by created_at"
      )
      const audit = await client.execute(
        "select action, target_type as targetType, metadata from audit_logs where id = 'legacy-updated'"
      )
      expect(comments.rows).toMatchObject([
        { issueId: "legacy-issue", body: "Preserved" },
      ])
      expect(activities.rows).toMatchObject([
        { kind: "created", field: null, fromValue: null, toValue: null },
        {
          kind: "legacy_updated",
          field: null,
          fromValue: null,
          toValue: null,
        },
      ])
      expect(audit.rows).toMatchObject([
        {
          action: "issue.updated",
          targetType: "issue",
          metadata: '{"issueId":"legacy-issue"}',
        },
      ])
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })

  it("backfills deterministic activity only for current ready issue files", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0010_secret_jimmy_woo",
    })

    try {
      await migrate(drizzle(client), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "file-user-a",
            "File User A",
            "file-a@test.example",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "file-user-b",
            "File User B",
            "file-b@test.example",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["file-org-a", "File Org A", "file-org-a", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["file-org-b", "File Org B", "file-org-b", now],
        },
        {
          sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "file-issue-a",
            "file-org-a",
            1,
            "Issue A",
            "file-user-a",
            now,
            now,
          ],
        },
        {
          sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "file-issue-b",
            "file-org-b",
            1,
            "Issue B",
            "file-user-b",
            now,
            now,
          ],
        },
        {
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,etag,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "ready-file",
            "file-org-a",
            "file-user-a",
            "ready-upload",
            "issue",
            "organizations/file-org-a/files/issue/file-issue-a/ready-file",
            'roadmap "final".txt',
            128,
            "text/plain",
            "ready-etag",
            "ready",
            now - 2_000,
            now + 1_000,
          ],
        },
        {
          sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
          args: ["ready-file", "file-org-a", "issue", "file-issue-a"],
        },
        {
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "pending-file",
            "file-org-a",
            "file-user-a",
            "pending-upload",
            "issue",
            "organizations/file-org-a/files/issue/file-issue-a/pending-file",
            "pending.txt",
            64,
            "text/plain",
            "pending",
            now - 1_000,
            now + 2_000,
          ],
        },
        {
          sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
          args: ["pending-file", "file-org-a", "issue", "file-issue-a"],
        },
        {
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,etag,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "unowned-ready-file",
            "file-org-a",
            "file-user-a",
            "unowned-ready-upload",
            "issue",
            "organizations/file-org-a/files/issue/file-issue-a/unowned-ready-file",
            "unowned.txt",
            32,
            "text/plain",
            "unowned-etag",
            "ready",
            now,
            now + 3_000,
          ],
        },
        {
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,etag,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "existing-file",
            "file-org-b",
            "file-user-b",
            "existing-upload",
            "issue",
            "organizations/file-org-b/files/issue/file-issue-b/existing-file",
            "already-added.txt",
            16,
            "text/plain",
            "existing-etag",
            "ready",
            now,
            now + 4_000,
          ],
        },
        {
          sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
          args: ["existing-file", "file-org-b", "issue", "file-issue-b"],
        },
        {
          sql: "insert into issue_activity_events(id,organization_id,issue_id,actor_user_id,batch_id,position,kind,field,from_value,to_value,created_at) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "file:existing-file:added",
            "file-org-b",
            "file-issue-b",
            "file-user-b",
            "file:existing-file:added",
            0,
            "file_added",
            null,
            null,
            JSON.stringify("already-added.txt"),
            now + 4_000,
          ],
        },
      ])

      await migrate(drizzle(client), { migrationsFolder })
      await migrate(drizzle(client), { migrationsFolder })

      const activities = await client.execute(
        `select id,
          organization_id as organizationId,
          issue_id as issueId,
          actor_user_id as actorUserId,
          batch_id as batchId,
          kind,
          field,
          from_value as fromValue,
          to_value as toValue,
          created_at as createdAt
        from issue_activity_events
        where kind = 'file_added'
        order by id`
      )

      expect(activities.rows).toMatchObject([
        {
          id: "file:existing-file:added",
          organizationId: "file-org-b",
          issueId: "file-issue-b",
          actorUserId: "file-user-b",
          batchId: "file:existing-file:added",
          kind: "file_added",
          field: null,
          fromValue: null,
          toValue: JSON.stringify("already-added.txt"),
          createdAt: now + 4_000,
        },
        {
          id: "file:ready-file:added",
          organizationId: "file-org-a",
          issueId: "file-issue-a",
          actorUserId: "file-user-a",
          batchId: "file:ready-file:added",
          kind: "file_added",
          field: null,
          fromValue: null,
          toValue: JSON.stringify('roadmap "final".txt'),
          createdAt: now + 1_000,
        },
      ])
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })
})
