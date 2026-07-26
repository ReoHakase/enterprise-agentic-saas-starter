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

describe("database migrations: upgrades", () => {
  it("upgrades the Agent message schema without losing run guards", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0016_agent_messages",
    })

    try {
      await migrate(drizzle(client), { migrationsFolder: migrationPrefix })
      await migrate(drizzle(client), { migrationsFolder })

      const columns = await client.execute("pragma table_info(agent_runs)")
      expect(columns.rows.map(({ name }) => name)).toEqual(
        expect.arrayContaining(["attempt", "web_search_used_at"])
      )
      const triggers = await client.execute({
        sql: "select name from sqlite_master where type = 'trigger' and name in (?,?,?,?,?,?) order by name",
        args: [
          "agent_actions_scope_insert",
          "agent_resource_usage_operations_apply",
          "agent_runs_required_identifiers_insert",
          "agent_runs_required_identifiers_update",
          "agent_runs_resume_action_scope_insert",
          "agent_session_contexts_revoke_old_epoch",
        ],
      })
      expect(triggers.rows.map(({ name }) => name)).toEqual([
        "agent_actions_scope_insert",
        "agent_resource_usage_operations_apply",
        "agent_runs_required_identifiers_insert",
        "agent_runs_required_identifiers_update",
        "agent_runs_resume_action_scope_insert",
        "agent_session_contexts_revoke_old_epoch",
      ])
      expect((await client.execute("pragma foreign_key_check")).rows).toEqual(
        []
      )
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })

  it("upgrades thread titles and revokes legacy timed Agent policies", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0018_mysterious_sage",
    })

    try {
      await migrate(drizzle(client), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["agent-user", "Agent User", "agent@example.test", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["agent-org", "Agent Org", "agent-org", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["agent-member", "agent-org", "agent-user", "super_admin", now],
        },
        {
          sql: "insert into session(id,expires_at,token,created_at,updated_at,user_id,active_organization_id) values(?,?,?,?,?,?,?)",
          args: [
            "agent-session",
            now + 3_600_000,
            "agent-session-token",
            now,
            now,
            "agent-user",
            "agent-org",
          ],
        },
        {
          sql: "insert into agent_session_contexts(session_id,user_id,context_epoch,updated_at) values(?,?,?,?)",
          args: ["agent-session", "agent-user", 1, now],
        },
        {
          sql: "insert into agent_threads(id,organization_id,owner_user_id,title,title_state,status,created_at,updated_at) values(?,?,?,?,?,?,?,?)",
          args: [
            "agent-thread",
            "agent-org",
            "agent-user",
            "Generated title",
            "agent",
            "active",
            now,
            now,
          ],
        },
        {
          sql: "insert into agent_approval_policies(id,organization_id,thread_id,session_id,user_id,context_epoch,mode,destructive_confirmed_at,created_at,expires_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "legacy-policy",
            "agent-org",
            "agent-thread",
            "agent-session",
            "agent-user",
            1,
            "auto_all",
            now,
            now,
            now + 600_000,
            now,
          ],
        },
      ])

      await migrate(drizzle(client), { migrationsFolder })

      const [thread, policy, permissionTable, actionTrigger] =
        await Promise.all([
          client.execute(
            "select title_state_v2 as titleState,title_revision as titleRevision from agent_threads where id = 'agent-thread'"
          ),
          client.execute(
            "select revoked_at as revokedAt from agent_approval_policies where id = 'legacy-policy'"
          ),
          client.execute(
            "select name from sqlite_master where type = 'table' and name = 'agent_thread_permissions'"
          ),
          client.execute(
            "select name from sqlite_master where type = 'trigger' and name = 'agent_actions_scope_insert'"
          ),
        ])
      expect(thread.rows).toMatchObject([
        { titleState: "agent", titleRevision: 1 },
      ])
      expect(policy.rows[0]?.revokedAt).not.toBeNull()
      expect(permissionTable.rows).toHaveLength(1)
      expect(actionTrigger.rows).toHaveLength(1)
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })

  it("backfills an initial Agent context epoch for existing sessions", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0012_natural_mathemanic",
    })

    try {
      await migrate(drizzle(client), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "agent-user",
            "Agent User",
            "agent-user@example.test",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into session(id,expires_at,token,created_at,updated_at,user_id) values(?,?,?,?,?,?)",
          args: [
            "agent-session",
            now + 3_600_000,
            "agent-session-token",
            now,
            now,
            "agent-user",
          ],
        },
      ])

      await migrate(drizzle(client), { migrationsFolder })

      const contexts = await client.execute(
        "select session_id as sessionId,user_id as userId,context_epoch as contextEpoch,updated_at as updatedAt from agent_session_contexts"
      )
      expect(contexts.rows).toMatchObject([
        {
          sessionId: "agent-session",
          userId: "agent-user",
          contextEpoch: 1,
          updatedAt: now,
        },
      ])
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })

  it("expands legacy files into one storage object and file claim without moving keys", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0013_agent_control_plane",
    })

    try {
      await migrate(drizzle(client), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "storage-user",
            "Storage User",
            "storage-user@example.test",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["storage-org", "Storage Org", "storage-org", now],
        },
        {
          sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "storage-issue",
            "storage-org",
            1,
            "Storage issue",
            "storage-user",
            now,
            now,
          ],
        },
        {
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "legacy-pending-file",
            "storage-org",
            "storage-user",
            "legacy-pending-upload",
            "issue",
            "organizations/storage-org/files/issue/storage-issue/legacy-pending-file",
            "pending.png",
            100,
            "image/png",
            "pending",
            now,
            now,
          ],
        },
        {
          sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,detected_image_format,image_width,image_height,etag,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "legacy-ready-file",
            "storage-org",
            "storage-user",
            "legacy-ready-upload",
            "issue",
            "organizations/storage-org/files/issue/storage-issue/legacy-ready-file",
            "ready.png",
            200,
            "image/png",
            "png",
            16,
            16,
            "legacy-ready-etag",
            "ready",
            now + 1,
            now + 1,
          ],
        },
        {
          sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
          args: [
            "legacy-pending-file",
            "storage-org",
            "issue",
            "storage-issue",
          ],
        },
        {
          sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
          args: ["legacy-ready-file", "storage-org", "issue", "storage-issue"],
        },
        {
          sql: "insert into organization_file_usage(organization_id,used_bytes,updated_at) values(?,?,?)",
          args: ["storage-org", 300, now],
        },
      ])

      await migrate(drizzle(client), { migrationsFolder })
      await migrate(drizzle(client), { migrationsFolder })

      const [objects, files, claims, owners, usage, columns, foreignKeys] =
        await Promise.all([
          client.execute(
            "select id,organization_id as organizationId,upload_id as uploadId,object_key as objectKey,size_bytes as sizeBytes,status,key_version as keyVersion,cleanup_revision as cleanupRevision from storage_objects order by id"
          ),
          client.execute(
            "select id,object_key as objectKey,storage_object_id as storageObjectId,key_version as keyVersion from files order by id"
          ),
          client.execute(
            "select storage_object_id as storageObjectId,organization_id as organizationId,holder_type as holderType,holder_id as holderId,revision from storage_object_claims order by storage_object_id"
          ),
          client.execute(
            "select file_id as fileId,issue_id as issueId from issue_file_owners order by file_id"
          ),
          client.execute(
            "select used_bytes as usedBytes,temporary_bytes as temporaryBytes from organization_file_usage where organization_id = 'storage-org'"
          ),
          client.execute("pragma table_info('files')"),
          client.execute("pragma foreign_key_check"),
        ])

      expect(objects.rows).toMatchObject([
        {
          id: "legacy-pending-file",
          organizationId: "storage-org",
          uploadId: "legacy-pending-upload",
          objectKey:
            "organizations/storage-org/files/issue/storage-issue/legacy-pending-file",
          sizeBytes: 100,
          status: "pending",
          keyVersion: 1,
          cleanupRevision: 0,
        },
        {
          id: "legacy-ready-file",
          organizationId: "storage-org",
          uploadId: "legacy-ready-upload",
          objectKey:
            "organizations/storage-org/files/issue/storage-issue/legacy-ready-file",
          sizeBytes: 200,
          status: "ready",
          keyVersion: 1,
          cleanupRevision: 0,
        },
      ])
      expect(files.rows).toMatchObject([
        {
          id: "legacy-pending-file",
          objectKey:
            "organizations/storage-org/files/issue/storage-issue/legacy-pending-file",
          storageObjectId: "legacy-pending-file",
          keyVersion: 1,
        },
        {
          id: "legacy-ready-file",
          objectKey:
            "organizations/storage-org/files/issue/storage-issue/legacy-ready-file",
          storageObjectId: "legacy-ready-file",
          keyVersion: 1,
        },
      ])
      expect(claims.rows).toMatchObject([
        {
          storageObjectId: "legacy-pending-file",
          organizationId: "storage-org",
          holderType: "file",
          holderId: "legacy-pending-file",
          revision: 1,
        },
        {
          storageObjectId: "legacy-ready-file",
          organizationId: "storage-org",
          holderType: "file",
          holderId: "legacy-ready-file",
          revision: 1,
        },
      ])
      expect(owners.rows).toMatchObject([
        { fileId: "legacy-pending-file", issueId: "storage-issue" },
        { fileId: "legacy-ready-file", issueId: "storage-issue" },
      ])
      expect(usage.rows).toMatchObject([{ usedBytes: 300, temporaryBytes: 0 }])
      expect(columns.rows.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "object_key",
          "upload_id",
          "storage_object_id",
          "key_version",
        ])
      )
      expect(foreignKeys.rows).toHaveLength(0)
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })

  it("upgrades the storage schema to the Agent action runtime without losing Issues", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0014_agent_storage_expand",
    })

    try {
      await migrate(drizzle(client), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "action-upgrade-user",
            "Action Upgrade User",
            "action-upgrade@example.test",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: [
            "action-upgrade-org",
            "Action Upgrade Org",
            "action-upgrade-org",
            now,
          ],
        },
        {
          sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "action-upgrade-issue",
            "action-upgrade-org",
            1,
            "Preserved Issue",
            "action-upgrade-user",
            now,
            now,
          ],
        },
      ])

      await migrate(drizzle(client), { migrationsFolder })
      await migrate(drizzle(client), { migrationsFolder })

      const [issue, tables, triggers, foreignKeys] = await Promise.all([
        client.execute(
          "select id,title,revision from issues where id = 'action-upgrade-issue'"
        ),
        client.execute(
          "select name from sqlite_master where type = 'table' order by name"
        ),
        client.execute(
          "select name from sqlite_master where type = 'trigger' order by name"
        ),
        client.execute("pragma foreign_key_check"),
      ])

      expect(issue.rows).toMatchObject([
        {
          id: "action-upgrade-issue",
          title: "Preserved Issue",
          revision: 1,
        },
      ])
      expect(tables.rows.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "agent_action_assets",
          "agent_actions",
          "agent_approval_policies",
          "agent_resource_usage_buckets",
          "agent_resource_usage_operations",
          "agent_resume_tickets",
          "agent_usage_events",
        ])
      )
      expect(triggers.rows.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "agent_actions_state_update",
          "agent_assets_state_machine_update",
          "agent_session_contexts_revoke_old_epoch",
          "issues_revision_auto_increment",
          "storage_object_claims_promotion_update",
        ])
      )
      expect(foreignKeys.rows).toHaveLength(0)
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })
})

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
      expect(members.rows).toMatchObject([{ role: "super_admin" }])
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
