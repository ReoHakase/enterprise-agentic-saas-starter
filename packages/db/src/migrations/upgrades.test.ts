import { rm } from "node:fs/promises"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import {
  assertLegacyUpdateActionCompatibility,
  seedLegacyUpdateActionScope,
} from "../test-support/agent-action-compatibility-fixture"
import {
  removedAgentHistoryTables,
  retainedAgentRegistryTables,
  retainedAgentRegistryTriggers,
} from "../test-support/agent-registry-upgrade-fixtures"
import { createMigrationPrefix, migrationsFolder } from "./helpers"

describe("database migrations: upgrades", () => {
  it("changes only new Agent run defaults to the Luna profile", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0024_agent_update_attachment_actions",
    })

    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["luna-user", "Luna User", "luna@example.test", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["luna-org", "Luna Org", "luna-org", now],
        },
        {
          sql: "insert into session(id,expires_at,token,created_at,updated_at,user_id,active_organization_id) values(?,?,?,?,?,?,?)",
          args: [
            "luna-session",
            now + 3_600_000,
            "luna-session-token",
            now,
            now,
            "luna-user",
            "luna-org",
          ],
        },
        {
          sql: "insert into agent_session_contexts(session_id,user_id,context_epoch,updated_at) values(?,?,?,?)",
          args: ["luna-session", "luna-user", 1, now],
        },
        {
          sql: "insert into agent_threads(id,organization_id,owner_user_id,status,created_at,archived_at) values(?,?,?,?,?,?)",
          args: ["luna-thread", "luna-org", "luna-user", "active", now, null],
        },
        {
          sql: "insert into agent_runs(id,organization_id,thread_id,root_run_id,session_id,user_id,context_epoch,client_message_id,status,scope,model_profile_id,context_window_token_count,started_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "qwen-run",
            "luna-org",
            "luna-thread",
            "qwen-run",
            "luna-session",
            "luna-user",
            1,
            "qwen-message",
            "running",
            "chat",
            "openrouter-qwen3.6-flash",
            256_000,
            now,
            now + 300_000,
          ],
        },
      ])

      await migrate(drizzle({ client }), { migrationsFolder })
      await client.execute({
        sql: "insert into agent_runs(id,organization_id,thread_id,root_run_id,session_id,user_id,context_epoch,client_message_id,status,scope,started_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
        args: [
          "luna-run",
          "luna-org",
          "luna-thread",
          "luna-run",
          "luna-session",
          "luna-user",
          1,
          "luna-message",
          "running",
          "chat",
          now + 1,
          now + 300_001,
        ],
      })
      const runs = await client.execute(
        "select id,model_profile_id,context_window_token_count from agent_runs order by id"
      )
      expect(runs.rows).toEqual([
        {
          id: "luna-run",
          model_profile_id: "openrouter-gpt-5.6-luna-xhigh",
          context_window_token_count: 1_050_000,
        },
        {
          id: "qwen-run",
          model_profile_id: "openrouter-qwen3.6-flash",
          context_window_token_count: 256_000,
        },
      ])
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })

  it("keeps legacy update action documents compatible through 0024", async () => {
    expect.assertions(7)
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0023_gorgeous_titanium_man",
    })

    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      const legacy = await seedLegacyUpdateActionScope(client, now)

      await migrate(drizzle({ client }), { migrationsFolder })
      await assertLegacyUpdateActionCompatibility(client, legacy, now)
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })

  it("upgrades attachment promotion guards for exact update operations", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0023_gorgeous_titanium_man",
    })

    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
      await migrate(drizzle({ client }), { migrationsFolder })

      const objects = await client.execute(
        "select name, type, sql from sqlite_master where name in ('agent_action_assets_scope_insert','agent_action_assets_quota_classify_before','agent_assets_state_machine_update','storage_object_claims_promotion_update','agent_update_attachment_success_integrity') order by name"
      )
      expect(objects.rows.map(({ name }) => name)).toEqual([
        "agent_action_assets_quota_classify_before",
        "agent_action_assets_scope_insert",
        "agent_assets_state_machine_update",
        "agent_update_attachment_success_integrity",
        "storage_object_claims_promotion_update",
      ])
      const scope = objects.rows.find(
        ({ name }) => name === "agent_action_assets_scope_insert"
      )
      expect(scope?.sql).toContain("ac.`kind` = 'create_issue'")
      expect(scope?.sql).toContain(
        "json_extract(ac.`normalized_payload`, '$.operation') = 'add_attachments'"
      )
      const integrity = objects.rows.find(
        ({ name }) => name === "agent_update_attachment_success_integrity"
      )
      expect(integrity?.sql).toContain(
        "json_array_length(NEW.`normalized_payload`, '$.attachments')"
      )
      expect(integrity?.sql).toContain(
        "coalesce(\n    json_extract(NEW.`normalized_payload`, '$.operation'),\n    'fields'"
      )
      expect(integrity?.sql).toContain(
        "agent_action_attachment_promotion_incomplete"
      )
      expect((await client.execute("pragma foreign_key_check")).rows).toEqual(
        []
      )
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })

  it("upgrades the Agent message schema without losing run guards", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0016_agent_messages",
    })

    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
      await migrate(drizzle({ client }), { migrationsFolder })

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
    const migrationTarget = await createMigrationPrefix({
      through: "0021_slippery_sabra",
    })

    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
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

      await migrate(drizzle({ client }), { migrationsFolder: migrationTarget })

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
      await rm(migrationTarget, { recursive: true, force: true })
    }
  })
})

describe("database migrations: Agent registry", () => {
  it("rebuilds the six-column Agent thread registry without losing descendants", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0021_slippery_sabra",
    })
    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "upgrade-user",
            "Upgrade User",
            "upgrade@example.test",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["upgrade-org", "Upgrade Org", "upgrade-org", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "upgrade-member",
            "upgrade-org",
            "upgrade-user",
            "super_admin",
            now,
          ],
        },
        {
          sql: "insert into session(id,expires_at,token,created_at,updated_at,user_id,active_organization_id) values(?,?,?,?,?,?,?)",
          args: [
            "upgrade-session",
            now + 3_600_000,
            "upgrade-token",
            now,
            now,
            "upgrade-user",
            "upgrade-org",
          ],
        },
        {
          sql: "insert into agent_session_contexts(session_id,user_id,context_epoch,updated_at) values(?,?,?,?)",
          args: ["upgrade-session", "upgrade-user", 1, now],
        },
        {
          sql: "insert into agent_threads(id,organization_id,owner_user_id,title,status,created_at,updated_at,title_state,title_state_v2,title_revision) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "active-thread",
            "upgrade-org",
            "upgrade-user",
            "Active legacy title",
            "active",
            now + 1,
            now + 2,
            "agent",
            "agent",
            4,
          ],
        },
        {
          sql: "insert into agent_threads(id,organization_id,owner_user_id,title,status,created_at,updated_at,title_state,title_state_v2,title_revision) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "archived-thread",
            "upgrade-org",
            "upgrade-user",
            "Archived legacy title",
            "archived",
            now + 3,
            now + 4,
            "agent",
            "agent",
            5,
          ],
        },
        {
          sql: "insert into agent_messages(id,organization_id,thread_id,client_message_id,role,content,created_at) values(?,?,?,?,?,?,?)",
          args: [
            "legacy-message",
            "upgrade-org",
            "active-thread",
            "legacy-client-message",
            "user",
            "{}",
            now + 5,
          ],
        },
        {
          sql: "insert into agent_thread_context_summaries(id,organization_id,thread_id,through_sequence,summary,estimated_token_count,model,created_at) values(?,?,?,?,?,?,?,?)",
          args: [
            "legacy-summary",
            "upgrade-org",
            "active-thread",
            1,
            "Legacy summary",
            1,
            "legacy-model",
            now + 6,
          ],
        },
        {
          sql: "insert into agent_runs(id,organization_id,thread_id,root_run_id,session_id,user_id,context_epoch,client_message_id,status,scope,started_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-run",
            "upgrade-org",
            "active-thread",
            "upgrade-run",
            "upgrade-session",
            "upgrade-user",
            1,
            "upgrade-run-message",
            "running",
            "chat",
            now + 10,
            now + 300_010,
          ],
        },
        {
          sql: "insert into agent_connection_tickets(id,token_hash,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-ticket",
            "a".repeat(64),
            "upgrade-org",
            "active-thread",
            "upgrade-session",
            "upgrade-user",
            1,
            now + 10,
            now + 60_010,
          ],
        },
        {
          sql: "insert into agent_grants(id,token_hash,kind,organization_id,thread_id,run_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-grant",
            "b".repeat(64),
            "run",
            "upgrade-org",
            "active-thread",
            "upgrade-run",
            "upgrade-session",
            "upgrade-user",
            1,
            now + 10,
            now + 300_010,
          ],
        },
        {
          sql: "insert into agent_approval_policies(id,organization_id,thread_id,session_id,user_id,context_epoch,mode,created_at,expires_at,updated_at) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-policy",
            "upgrade-org",
            "active-thread",
            "upgrade-session",
            "upgrade-user",
            1,
            "auto_write",
            now + 10,
            now + 600_010,
            now + 10,
          ],
        },
        {
          sql: "insert into agent_thread_permissions(id,organization_id,thread_id,session_id,user_id,context_epoch,mode,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-permission",
            "upgrade-org",
            "active-thread",
            "upgrade-session",
            "upgrade-user",
            1,
            "ask_always",
            now + 10,
            now + 10,
          ],
        },
        {
          sql: "insert into agent_usage_events(id,organization_id,thread_id,run_id,user_id,provider,model,duration_ms,run_event_id,created_at) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-usage",
            "upgrade-org",
            "active-thread",
            "upgrade-run",
            "upgrade-user",
            "test-provider",
            "test-model",
            1,
            "upgrade-run-event",
            now + 20,
          ],
        },
        {
          sql: "insert into storage_objects(id,organization_id,uploader_id,upload_id,object_key,size_bytes,declared_content_type,etag,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-object",
            "upgrade-org",
            "upgrade-user",
            "upgrade-upload",
            "organizations/upgrade-org/storage-objects/upgrade-object",
            1,
            "application/octet-stream",
            "fixture-etag",
            "ready",
            now + 20,
            now + 20,
          ],
        },
        {
          sql: "insert into agent_assets(id,organization_id,thread_id,session_id,context_epoch,uploader_id,storage_object_id,filename,status,expires_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-asset",
            "upgrade-org",
            "active-thread",
            "upgrade-session",
            1,
            "upgrade-user",
            "upgrade-object",
            "fixture.bin",
            "pending",
            now + 600_020,
            now + 20,
            now + 20,
          ],
        },
        {
          sql: "insert into storage_object_claims(storage_object_id,organization_id,holder_type,holder_id,revision,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "upgrade-object",
            "upgrade-org",
            "agent_asset",
            "upgrade-asset",
            1,
            now + 20,
            now + 20,
          ],
        },
        {
          sql: "update agent_assets set status = ?, updated_at = ? where id = ?",
          args: ["ready", now + 21, "upgrade-asset"],
        },
        {
          sql: "insert into agent_run_assets(organization_id,run_id,asset_id,storage_object_id,source_etag,size_bytes,created_at) values(?,?,?,?,?,?,?)",
          args: [
            "upgrade-org",
            "upgrade-run",
            "upgrade-asset",
            "upgrade-object",
            "fixture-etag",
            1,
            now + 21,
          ],
        },
        {
          sql: "insert into agent_actions(id,organization_id,thread_id,run_id,session_id,user_id,context_epoch,tool_call_id,kind,normalized_payload,canonical_preview,target_id,status,decision_provenance,decision_policy_id,decided_at,idempotency_key,created_at,updated_at,expires_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-action",
            "upgrade-org",
            "active-thread",
            "upgrade-run",
            "upgrade-session",
            "upgrade-user",
            1,
            "upgrade-tool",
            "create_issue",
            "{}",
            "{}",
            "future-issue",
            "approved",
            "auto_policy",
            "upgrade-policy",
            now + 22,
            "upgrade-action-key",
            now + 22,
            now + 22,
            now + 600_022,
          ],
        },
        {
          sql: "insert into agent_action_assets(organization_id,action_id,asset_id,storage_object_id,source_etag,size_bytes,lease_expires_at,created_at) values(?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-org",
            "upgrade-action",
            "upgrade-asset",
            "upgrade-object",
            "fixture-etag",
            1,
            now + 60_010,
            now + 23,
          ],
        },
        {
          sql: "insert into agent_resume_tickets(id,token_hash,action_id,organization_id,thread_id,session_id,user_id,context_epoch,issued_at,expires_at) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "upgrade-resume-ticket",
            "c".repeat(64),
            "upgrade-action",
            "upgrade-org",
            "active-thread",
            "upgrade-session",
            "upgrade-user",
            1,
            now + 23,
            now + 60_023,
          ],
        },
      ])

      await migrate(drizzle({ client }), { migrationsFolder })

      const columns = await client.execute("pragma table_info(agent_threads)")
      expect(columns.rows.map(({ name }) => name)).toEqual([
        "id",
        "organization_id",
        "owner_user_id",
        "status",
        "created_at",
        "archived_at",
      ])
      const threads = await client.execute(
        "select id,created_at as createdAt,archived_at as archivedAt from agent_threads order by id"
      )
      expect(threads.rows).toMatchObject([
        { archivedAt: null, createdAt: now + 1, id: "active-thread" },
        { archivedAt: now + 4, createdAt: now + 3, id: "archived-thread" },
      ])
      for (const table of retainedAgentRegistryTables) {
        // oxlint-disable-next-line no-await-in-loop -- each retained table is checked after one migration.
        const count = await client.execute(
          `select count(*) as count from ${table}`
        )
        expect(count.rows[0]?.count).toBe(1)
      }
      for (const table of removedAgentHistoryTables) {
        // oxlint-disable-next-line no-await-in-loop -- each removed table is checked by sqlite metadata.
        const row = await client.execute({
          sql: "select name from sqlite_master where type = 'table' and name = ?",
          args: [table],
        })
        expect(row.rows).toEqual([])
      }
      const triggers = await client.execute(
        "select name from sqlite_master where type = 'trigger' and name in ('agent_actions_scope_insert','agent_approval_policies_scope_insert') order by name"
      )
      expect(triggers.rows.map(({ name }) => name)).toEqual(
        retainedAgentRegistryTriggers
      )
      expect((await client.execute("pragma foreign_key_check")).rows).toEqual(
        []
      )
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })
})

describe("database migrations: retained control plane", () => {
  it("backfills an initial Agent context epoch for existing sessions", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0012_natural_mathemanic",
    })

    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
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

      await migrate(drizzle({ client }), { migrationsFolder })

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
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
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

      await migrate(drizzle({ client }), { migrationsFolder })
      await migrate(drizzle({ client }), { migrationsFolder })

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
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
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

      await migrate(drizzle({ client }), { migrationsFolder })
      await migrate(drizzle({ client }), { migrationsFolder })

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
