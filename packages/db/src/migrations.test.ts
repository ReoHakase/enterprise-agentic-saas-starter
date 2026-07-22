import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { RESET_CONFIRMATION, resetLocalDevelopmentDatabase } from "./reset"
import { invitationEmailJobStatuses } from "./schema/app"
import { seedDevelopmentDatabase } from "./seed"

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname

const createMigrationPrefix = async (lastIndex: number) => {
  const directory = await mkdtemp(join(tmpdir(), "db-migrations-prefix-"))
  const metaDirectory = join(directory, "meta")
  await mkdir(metaDirectory)
  const journal: { entries: Array<{ idx: number; tag: string }> } = JSON.parse(
    await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8")
  )
  const entries = journal.entries.filter(({ idx }) => idx <= lastIndex)
  await Promise.all(
    entries.map(({ tag }) =>
      copyFile(
        join(migrationsFolder, `${tag}.sql`),
        join(directory, `${tag}.sql`)
      )
    )
  )
  await writeFile(
    join(metaDirectory, "_journal.json"),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`
  )
  return directory
}

const applyBaselineSchema = async (client: ReturnType<typeof createClient>) => {
  const baseline = await readFile(
    new URL("../drizzle/0000_baseline.sql", import.meta.url),
    "utf8"
  )
  const statements = baseline
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean)
  await client.batch(statements)
}

describe("database migrations", () => {
  it("migrates a fresh database to the current schema", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle(client)

    try {
      await migrate(db, { migrationsFolder })

      const tables = await client.execute({
        sql: "select name from sqlite_master where type = ? order by name",
        args: ["table"],
      })
      const indexes = await client.execute(
        "select name from sqlite_master where type = 'index' and tbl_name = 'member' order by name"
      )
      expect(tables.rows.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "agent_assets",
          "agent_connection_tickets",
          "agent_grants",
          "agent_run_assets",
          "agent_runs",
          "agent_session_contexts",
          "agent_threads",
          "audit_logs",
          "file_cleanup_jobs",
          "files",
          "invitation_email_jobs",
          "issue_file_owners",
          "organization_deletion_jobs",
          "organization_file_usage",
          "profile_image_cleanup_jobs",
          "profile_images",
          "rate_limit",
          "storage_object_claims",
          "storage_object_cleanup_jobs",
          "storage_objects",
          "issue_activity_events",
          "issue_comments",
          "issues",
        ])
      )
      expect(indexes.rows.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "member_organization_super_admin_uidx",
          "member_organization_user_uidx",
        ])
      )
    } finally {
      client.close()
    }
  })

  it("upgrades the Agent message schema without losing run guards", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix(16)

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

  it("backfills an initial Agent context epoch for existing sessions", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix(12)

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
    const migrationPrefix = await createMigrationPrefix(13)

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
    const migrationPrefix = await createMigrationPrefix(14)

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

  it("enforces profile image subject, idempotency, ready, and cleanup invariants", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,image,created_at,updated_at) values(?,?,?,?,?,?,?)",
          args: [
            "profile-user",
            "Profile User",
            "profile-user@example.test",
            1,
            "https://images.example.test/user.png",
            now,
            now,
          ],
        },
        {
          sql: "insert into organization(id,name,slug,logo,created_at) values(?,?,?,?,?)",
          args: [
            "profile-org",
            "Profile Org",
            "profile-org",
            "https://images.example.test/org.png",
            now,
          ],
        },
        {
          sql: "insert into profile_images(id,subject_type,subject_id,user_id,upload_id,source_hash,version,object_key,fallback_url,etag,status) values(?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            "profile-image-user",
            "user",
            "profile-user",
            "profile-user",
            "upload-user",
            "a".repeat(64),
            1,
            "users/profile-user/profile-images/profile-image-user.webp",
            "https://images.example.test/user.png",
            "etag-user",
            "ready",
          ],
        },
        {
          sql: "insert into profile_image_cleanup_jobs(id,subject_type,subject_id,object_key) values(?,?,?,?)",
          args: [
            "profile-cleanup",
            "user",
            "profile-user",
            "users/profile-user/profile-images/old.webp",
          ],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into profile_images(id,subject_type,subject_id,user_id,upload_id,source_hash,version,object_key,etag,status) values(?,?,?,?,?,?,?,?,?,?)",
          args: [
            "profile-image-second-ready",
            "user",
            "profile-user",
            "profile-user",
            "upload-second",
            "b".repeat(64),
            2,
            "users/profile-user/profile-images/second.webp",
            "etag-second",
            "ready",
          ],
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        client.execute({
          sql: "insert into profile_images(id,subject_type,subject_id,organization_id,upload_id,source_hash,version,object_key) values(?,?,?,?,?,?,?,?)",
          args: [
            "profile-image-invalid-owner",
            "user",
            "profile-user",
            "profile-org",
            "upload-invalid",
            "c".repeat(64),
            2,
            "users/profile-user/profile-images/invalid.webp",
          ],
        })
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute({
          sql: "insert into profile_images(id,subject_type,subject_id,upload_id,source_hash,version,object_key) values(?,?,?,?,?,?,?)",
          args: [
            "profile-image-null-owner",
            "user",
            "profile-user",
            "upload-null-owner",
            "d".repeat(64),
            2,
            "users/profile-user/profile-images/null-owner.webp",
          ],
        })
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute({
          sql: "insert into profile_images(id,subject_type,subject_id,organization_id,upload_id,source_hash,version,object_key,status) values(?,?,?,?,?,?,?,?,?)",
          args: [
            "profile-image-ready-without-etag",
            "organization",
            "profile-org",
            "profile-org",
            "upload-ready-without-etag",
            "e".repeat(64),
            1,
            "organizations/profile-org/profile-images/missing-etag.webp",
            "ready",
          ],
        })
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute({
          sql: "insert into profile_images(id,subject_type,subject_id,user_id,upload_id,source_hash,version,object_key) values(?,?,?,?,?,?,?,?)",
          args: [
            "profile-image-duplicate-upload",
            "user",
            "profile-user",
            "profile-user",
            "upload-user",
            "f".repeat(64),
            2,
            "users/profile-user/profile-images/duplicate.webp",
          ],
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        client.execute({
          sql: "insert into profile_images(id,subject_type,subject_id,user_id,upload_id,source_hash,version,object_key,status) values(?,?,?,?,?,?,?,?,?)",
          args: [
            "profile-image-superseded",
            "user",
            "profile-user",
            "profile-user",
            "upload-superseded",
            "0".repeat(64),
            2,
            "users/profile-user/profile-images/superseded.webp",
            "superseded",
          ],
        })
      ).resolves.toBeDefined()

      await client.execute("delete from user where id = 'profile-user'")
      const [images, cleanup] = await Promise.all([
        client.execute(
          "select id from profile_images where subject_id = 'profile-user'"
        ),
        client.execute(
          "select id from profile_image_cleanup_jobs where id = 'profile-cleanup'"
        ),
      ])
      expect(images.rows).toHaveLength(0)
      expect(cleanup.rows).toHaveLength(1)
    } finally {
      client.close()
    }
  })

  it("enforces durable invitation email job ownership and claim invariants", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["inviter", "Inviter", "inviter@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["invitation-org", "Invitation Org", "invitation-org", now],
        },
        {
          sql: "insert into invitation(id,organization_id,email,role,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?,?)",
          args: [
            "invitation-email-job",
            "invitation-org",
            "recipient@example.com",
            "member",
            "pending",
            now + 60_000,
            now,
            "inviter",
          ],
        },
        {
          sql: "insert into invitation_email_jobs(id,invitation_id) values(?,?)",
          args: ["email-job", "invitation-email-job"],
        },
      ])

      const [columns, foreignKeys, indexes, claimIndex] = await Promise.all([
        client.execute("pragma table_info('invitation_email_jobs')"),
        client.execute("pragma foreign_key_list('invitation_email_jobs')"),
        client.execute(
          "select name from sqlite_master where type = 'index' and tbl_name = 'invitation_email_jobs' order by name"
        ),
        client.execute("pragma index_info('invitation_email_jobs_claim_idx')"),
      ])
      expect(columns.rows.map(({ name }) => name)).toEqual([
        "id",
        "invitation_id",
        "status",
        "attempts",
        "last_error_code",
        "locked_at",
        "next_attempt_at",
        "created_at",
        "completed_at",
      ])
      expect(foreignKeys.rows).toMatchObject([
        {
          table: "invitation",
          from: "invitation_id",
          to: "id",
          on_delete: "CASCADE",
        },
      ])
      expect(indexes.rows.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "invitation_email_jobs_claim_idx",
          "invitation_email_jobs_invitation_uidx",
        ])
      )
      expect(claimIndex.rows.map(({ name }) => name)).toEqual([
        "status",
        "next_attempt_at",
        "created_at",
      ])
      const initialJob = await client.execute(
        "select status, attempts, created_at as createdAt from invitation_email_jobs where id = 'email-job'"
      )
      expect(initialJob.rows).toMatchObject([
        { status: "pending", attempts: 0 },
      ])
      expect(Number(initialJob.rows[0]?.createdAt)).toBeGreaterThan(0)

      await expect(
        client.batch(
          invitationEmailJobStatuses.map((status) => ({
            sql: "update invitation_email_jobs set status = ? where id = ?",
            args: [status, "email-job"],
          }))
        )
      ).resolves.toBeDefined()
      await expect(
        client.execute(
          "update invitation_email_jobs set status = 'cancelled' where id = 'email-job'"
        )
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute(
          "update invitation_email_jobs set attempts = -1 where id = 'email-job'"
        )
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute(
          "update invitation_email_jobs set last_error_code = 'provider.temporary_failure' where id = 'email-job'"
        )
      ).resolves.toBeDefined()
      await expect(
        client.execute(
          "update invitation_email_jobs set last_error_code = 'recipient@example.com' where id = 'email-job'"
        )
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute({
          sql: "update invitation_email_jobs set last_error_code = ? where id = 'email-job'",
          args: ["a".repeat(97)],
        })
      ).rejects.toThrow(/check constraint/i)

      await expect(
        client.execute({
          sql: "insert into invitation_email_jobs(id,invitation_id) values(?,?)",
          args: ["duplicate-email-job", "invitation-email-job"],
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        client.execute({
          sql: "insert into invitation_email_jobs(id,invitation_id) values(?,?)",
          args: ["orphan-email-job", "missing-invitation"],
        })
      ).rejects.toThrow(/foreign key/i)

      await client.execute(
        "delete from invitation where id = 'invitation-email-job'"
      )
      const jobs = await client.execute(
        "select id from invitation_email_jobs where id = 'email-job'"
      )
      expect(jobs.rows).toHaveLength(0)
    } finally {
      client.close()
    }
  })

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
    const migrationPrefix = await createMigrationPrefix(8)

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
    const migrationPrefix = await createMigrationPrefix(10)

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

  it("repairs legacy membership invariants deterministically and safely replays", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await applyBaselineSchema(client)

      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "dedupe-user",
            "Dedupe User",
            "dedupe@example.com",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["multi-a-user", "Multi A", "multi-a@example.com", 1, now, now],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["multi-z-user", "Multi Z", "multi-z@example.com", 1, now, now],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "zero-admin-user",
            "Zero Admin",
            "zero-admin@example.com",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "zero-member-user",
            "Zero Member",
            "zero-member@example.com",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-dedupe", "Dedupe", "dedupe", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-multi", "Multi", "multi", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-zero", "Zero", "zero", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-empty", "Empty", "empty", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["dedupe-a-stable", "org-dedupe", "dedupe-user", "member", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["dedupe-z-admin", "org-dedupe", "dedupe-user", "admin", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "dedupe-super",
            "org-dedupe",
            "dedupe-user",
            "super_admin",
            now + 1,
          ],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "multi-a-canonical",
            "org-multi",
            "multi-a-user",
            "owner",
            now,
          ],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "multi-z-demoted",
            "org-multi",
            "multi-z-user",
            "owner",
            now + 1,
          ],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "zero-a-member",
            "org-zero",
            "zero-member-user",
            "member",
            now,
          ],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "zero-z-admin",
            "org-zero",
            "zero-admin-user",
            "admin",
            now + 1,
          ],
        },
      ])

      const db = drizzle(client)
      await migrate(db, { migrationsFolder })

      const repairedMemberships = await client.execute(
        "select id, organization_id as organizationId, user_id as userId, role from member order by organization_id, id"
      )
      expect(repairedMemberships.rows).toMatchObject([
        {
          id: "dedupe-a-stable",
          organizationId: "org-dedupe",
          userId: "dedupe-user",
          role: "super_admin",
        },
        {
          id: "multi-a-canonical",
          organizationId: "org-multi",
          userId: "multi-a-user",
          role: "super_admin",
        },
        {
          id: "multi-z-demoted",
          organizationId: "org-multi",
          userId: "multi-z-user",
          role: "admin",
        },
        {
          id: "zero-a-member",
          organizationId: "org-zero",
          userId: "zero-member-user",
          role: "member",
        },
        {
          id: "zero-z-admin",
          organizationId: "org-zero",
          userId: "zero-admin-user",
          role: "super_admin",
        },
      ])

      const organizationRoles = await client.execute(
        `select
          organization.id,
          count(member.id) as memberCount,
          sum(case when member.role = 'super_admin' then 1 else 0 end) as superAdminCount
        from organization
        left join member on member.organization_id = organization.id
        group by organization.id
        order by organization.id`
      )
      expect(organizationRoles.rows).toMatchObject([
        { id: "org-dedupe", memberCount: 1, superAdminCount: 1 },
        { id: "org-empty", memberCount: 0, superAdminCount: 0 },
        { id: "org-multi", memberCount: 2, superAdminCount: 1 },
        { id: "org-zero", memberCount: 2, superAdminCount: 1 },
      ])

      await migrate(db, { migrationsFolder })
      const replayedMemberships = await client.execute(
        "select id, organization_id as organizationId, user_id as userId, role from member order by organization_id, id"
      )
      expect(replayedMemberships.rows).toEqual(repairedMemberships.rows)

      await expect(
        client.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "dedupe-duplicate",
            "org-dedupe",
            "dedupe-user",
            "member",
            now + 2,
          ],
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        client.execute(
          "update member set role = 'super_admin' where id = 'multi-z-demoted'"
        )
      ).rejects.toThrow(/unique/i)
    } finally {
      client.close()
    }
  })

  it("expires privileged and invalid pending invitations during migration", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await applyBaselineSchema(client)

      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["inviter", "Inviter", "inviter@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["invitation-org", "Invitation Org", "invitation-org", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["inviter-member", "invitation-org", "inviter", "member", now],
        },
        ...(
          [
            ["admin", "admin"],
            ["member", "member"],
            ["owner", "owner"],
            ["super-admin", "super_admin"],
            ["missing", null],
            ["custom", "custom_role"],
          ] as const
        ).map(([id, role]) => ({
          sql: "insert into invitation(id,organization_id,email,role,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?,?)",
          args: [
            `invitation-${id}`,
            "invitation-org",
            `${id}@example.com`,
            role,
            "pending",
            now + 60_000,
            now,
            "inviter",
          ],
        })),
      ])

      await migrate(drizzle(client), { migrationsFolder })

      const invitations = await client.execute(
        "select id, status from invitation order by id"
      )
      expect(invitations.rows).toMatchObject([
        { id: "invitation-admin", status: "pending" },
        { id: "invitation-custom", status: "expired" },
        { id: "invitation-member", status: "pending" },
        { id: "invitation-missing", status: "expired" },
        { id: "invitation-owner", status: "expired" },
        { id: "invitation-super-admin", status: "expired" },
      ])
    } finally {
      client.close()
    }
  })

  it("rejects a comment whose issue belongs to another tenant", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle(client)

    try {
      await migrate(db, { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-1", "Owner", "owner@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-a", "Org A", "org-a", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-b", "Org B", "org-b", now],
        },
        {
          sql: "insert into issues(id,organization_id,number,title,creator_id) values(?,?,?,?,?)",
          args: ["issue-a", "org-a", 1, "Tenant A issue", "user-1"],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into issue_comments(id,issue_id,organization_id,author_id,body) values(?,?,?,?,?)",
          args: ["comment-1", "issue-a", "org-b", "user-1", "cross tenant"],
        })
      ).rejects.toThrow(/foreign key/i)
    } finally {
      client.close()
    }
  })

  it("rejects an activity event whose issue belongs to another tenant", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle(client)

    try {
      await migrate(db, { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-1", "Owner", "owner@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-a", "Org A", "org-a", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-b", "Org B", "org-b", now],
        },
        {
          sql: "insert into issues(id,organization_id,number,title,creator_id) values(?,?,?,?,?)",
          args: ["issue-a", "org-a", 1, "Tenant A issue", "user-1"],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into issue_activity_events(id,organization_id,issue_id,actor_user_id,batch_id,kind) values(?,?,?,?,?,?)",
          args: [
            "activity-1",
            "org-b",
            "issue-a",
            "user-1",
            "batch-1",
            "created",
          ],
        })
      ).rejects.toThrow(/foreign key/i)
    } finally {
      client.close()
    }
  })

  it("keeps organization deletion jobs durable and idempotent", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["actor-1", "Actor", "actor@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-delete", "Delete Me", "delete-me", now],
        },
        {
          sql: "insert into organization_deletion_jobs(id,organization_id,requested_by_user_id,idempotency_key,status) values(?,?,?,?,?)",
          args: [
            "deletion-job-1",
            "org-delete",
            "actor-1",
            "delete-org-delete",
            "pending",
          ],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into organization_deletion_jobs(id,organization_id,requested_by_user_id,idempotency_key,status) values(?,?,?,?,?)",
          args: [
            "deletion-job-invalid-status",
            "org-delete",
            "actor-1",
            "invalid-status",
            "cancelled",
          ],
        })
      ).rejects.toThrow(/check constraint/i)

      await expect(
        client.execute({
          sql: "insert into organization_deletion_jobs(id,organization_id,requested_by_user_id,idempotency_key,status) values(?,?,?,?,?)",
          args: [
            "deletion-job-duplicate",
            "org-delete",
            "actor-1",
            "delete-org-delete",
            "pending",
          ],
        })
      ).rejects.toThrow(/unique/i)

      await client.execute("delete from organization where id = 'org-delete'")
      const jobs = await client.execute(
        "select id, organization_id as organizationId, requested_by_user_id as requestedByUserId, idempotency_key as idempotencyKey, status from organization_deletion_jobs"
      )
      expect(jobs.rows).toMatchObject([
        {
          id: "deletion-job-1",
          organizationId: "org-delete",
          requestedByUserId: "actor-1",
          idempotencyKey: "delete-org-delete",
          status: "pending",
        },
      ])
    } finally {
      client.close()
    }
  })

  it("allows only one pending invitation per tenant and normalized email", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle(client)

    try {
      await migrate(db, { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-1", "Owner", "owner@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-a", "Org A", "org-a", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-b", "Org B", "org-b", now],
        },
        {
          sql: "insert into invitation(id,organization_id,email,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?)",
          args: [
            "invitation-1",
            "org-a",
            "member@example.com",
            "pending",
            now + 60_000,
            now,
            "user-1",
          ],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into invitation(id,organization_id,email,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?)",
          args: [
            "invitation-duplicate",
            "org-a",
            "MEMBER@EXAMPLE.COM",
            "pending",
            now + 60_000,
            now,
            "user-1",
          ],
        })
      ).rejects.toThrow(/unique/i)

      await expect(
        client.batch([
          {
            sql: "insert into invitation(id,organization_id,email,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?)",
            args: [
              "invitation-expired",
              "org-a",
              "member@example.com",
              "expired",
              now - 1,
              now,
              "user-1",
            ],
          },
          {
            sql: "insert into invitation(id,organization_id,email,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?)",
            args: [
              "invitation-other-tenant",
              "org-b",
              "member@example.com",
              "pending",
              now + 60_000,
              now,
              "user-1",
            ],
          },
        ])
      ).resolves.toBeDefined()
    } finally {
      client.close()
    }
  })

  it("keeps one super admin membership under concurrent insert attempts", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "enterprise-saas-membership-concurrency-")
    )
    const databasePath = join(directory, "membership.db")
    const connection = { url: `file:${databasePath}` }
    const bootstrapClient = createClient(connection)
    const contenderA = createClient(connection)
    const contenderB = createClient(connection)

    try {
      await migrate(drizzle(bootstrapClient), { migrationsFolder })
      const now = Date.now()
      await bootstrapClient.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-a", "User A", "user-a@example.com", 1, now, now],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-b", "User B", "user-b@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-concurrent", "Concurrent", "concurrent", now],
        },
      ])

      const attempts = await Promise.allSettled([
        contenderA.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "membership-a",
            "org-concurrent",
            "user-a",
            "super_admin",
            now,
          ],
        }),
        contenderB.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "membership-b",
            "org-concurrent",
            "user-a",
            "super_admin",
            now,
          ],
        }),
      ])
      expect(
        attempts.filter((attempt) => attempt.status === "fulfilled")
      ).toHaveLength(1)

      const invariant = await bootstrapClient.execute(
        `select
          count(*) as memberCount,
          sum(case when role = 'super_admin' then 1 else 0 end) as superAdminCount
        from member
        where organization_id = 'org-concurrent'`
      )
      expect(invariant.rows).toMatchObject([
        { memberCount: 1, superAdminCount: 1 },
      ])

      await expect(
        bootstrapClient.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "membership-duplicate-user",
            "org-concurrent",
            "user-a",
            "member",
            now + 1,
          ],
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        bootstrapClient.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "membership-second-super-admin",
            "org-concurrent",
            "user-b",
            "super_admin",
            now + 1,
          ],
        })
      ).rejects.toThrow(/unique/i)
    } finally {
      bootstrapClient.close()
      contenderA.close()
      contenderB.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("refuses development seed against a remote Turso database", async () => {
    await expect(
      seedDevelopmentDatabase({
        url: "libsql://production-example.turso.io",
        authToken: "not-used",
      })
    ).rejects.toThrow(/restricted to file: databases and localhost/i)
    await expect(
      seedDevelopmentDatabase({
        url: "file://storage.example.com/shared.db",
      })
    ).rejects.toThrow(/restricted to file: databases and localhost/i)
  })

  it("refuses development seed and reset in production even for a local URL", async () => {
    const previousNodeEnvironment = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      await expect(
        seedDevelopmentDatabase({ url: "file::memory:" })
      ).rejects.toThrow(/seed is disabled in production/i)
      await expect(
        resetLocalDevelopmentDatabase(
          { url: "file::memory:" },
          RESET_CONFIRMATION
        )
      ).rejects.toThrow(/reset is disabled in production/i)
    } finally {
      if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnvironment
    }
  })

  it("rebuilds a local file database from migrations before seeding", async () => {
    const directory = await mkdtemp(join(tmpdir(), "enterprise-saas-db-reset-"))
    const databasePath = join(directory, "reset.db")
    const connection = { url: `file:${databasePath}` }
    const client = createClient(connection)

    try {
      await client.execute("create table obsolete_local_table(id text)")
      client.close()

      await resetLocalDevelopmentDatabase(connection, RESET_CONFIRMATION)

      const verificationClient = createClient(connection)
      try {
        const [
          migrationCount,
          userCount,
          issueCount,
          fileCount,
          fileOwnerCount,
          usage,
          obsoleteTable,
        ] = await Promise.all([
          verificationClient.execute(
            "select count(*) as value from __drizzle_migrations"
          ),
          verificationClient.execute("select count(*) as value from user"),
          verificationClient.execute("select count(*) as value from issues"),
          verificationClient.execute(
            "select count(*) as value from files where status = 'pending'"
          ),
          verificationClient.execute(
            "select count(*) as value from issue_file_owners"
          ),
          verificationClient.execute(
            "select organization_id as organizationId, used_bytes as usedBytes from organization_file_usage where used_bytes > 0 order by organization_id"
          ),
          verificationClient.execute(
            "select name from sqlite_master where type = 'table' and name = 'obsolete_local_table'"
          ),
        ])

        expect(Number(migrationCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(Number(userCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(Number(issueCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(Number(fileCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(fileOwnerCount.rows).toEqual(fileCount.rows)
        expect(usage.rows).toHaveLength(2)
        expect(usage.rows.every(({ usedBytes }) => Number(usedBytes) > 0)).toBe(
          true
        )
        expect(obsoleteTable.rows).toHaveLength(0)
      } finally {
        verificationClient.close()
      }
    } finally {
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
