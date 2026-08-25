import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { migrationsFolder } from "./helpers"

const baselineTriggerNames = [
  "agent_action_assets_immutable_update",
  "agent_action_assets_quota_classify_after",
  "agent_action_assets_quota_classify_before",
  "agent_action_assets_release_update",
  "agent_action_assets_scope_insert",
  "agent_actions_immutable_update",
  "agent_actions_payload_scrub_update",
  "agent_actions_scope_insert",
  "agent_actions_state_update",
  "agent_actions_terminal_release_assets",
  "agent_approval_policies_immutable_update",
  "agent_approval_policies_scope_insert",
  "agent_assets_immutable_update",
  "agent_assets_initial_state_insert",
  "agent_assets_state_machine_update",
  "agent_resource_usage_operations_apply",
  "agent_resource_usage_operations_immutable",
  "agent_resume_tickets_scope_insert",
  "agent_resume_tickets_terminal_update",
  "agent_run_assets_insert_limits",
  "agent_run_assets_update_limits",
  "agent_runs_required_identifiers_insert",
  "agent_runs_required_identifiers_update",
  "agent_runs_resume_action_scope_insert",
  "agent_session_contexts_revoke_old_epoch",
  "agent_session_contexts_rotation_guard",
  "agent_update_attachment_success_integrity",
  "files_before_delete_detach_promoted_asset",
  "files_ready_physical_immutable",
  "files_v2_initial_state_insert",
  "files_v2_ready_update",
  "issues_revision_auto_increment",
  "issues_revision_guard",
  "session_agent_context_rotate_organization",
  "storage_object_claims_holder_insert",
  "storage_object_claims_insert_live_object",
  "storage_object_claims_promotion_update",
  "storage_object_claims_update_live_object",
  "storage_object_cleanup_jobs_insert_fence",
  "storage_object_cleanup_jobs_update_fence_immutable",
  "storage_objects_before_delete_clear_agent_action_assets",
  "storage_objects_before_delete_clear_agent_run_assets",
  "storage_objects_identity_immutable",
  "storage_objects_update_cleanup_without_claim",
  "storage_objects_update_state_machine",
] as const

const insertProfileImageFixture = async (
  client: ReturnType<typeof createClient>
) => {
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
}

const insertIssueThumbnailFixture = async (
  client: ReturnType<typeof createClient>
) => {
  await client.batch([
    {
      sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
      args: [
        "thumbnail-user",
        "Thumbnail User",
        "thumbnail@example.test",
        1,
        1,
        1,
      ],
    },
    {
      sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
      args: ["thumbnail-org", "Thumbnail Org", "thumbnail-org", 1],
    },
    {
      sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
      args: [
        "thumbnail-issue-a",
        "thumbnail-org",
        1,
        "Issue A",
        "thumbnail-user",
        1,
        1,
      ],
    },
    {
      sql: "insert into issues(id,organization_id,number,title,creator_id,created_at,updated_at) values(?,?,?,?,?,?,?)",
      args: [
        "thumbnail-issue-b",
        "thumbnail-org",
        2,
        "Issue B",
        "thumbnail-user",
        1,
        1,
      ],
    },
    {
      sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,detected_image_format,image_width,image_height,etag,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        "thumbnail-file-a",
        "thumbnail-org",
        "thumbnail-user",
        "thumbnail-upload-a",
        "issue",
        "thumbnail-object-a",
        "a.png",
        1,
        "image/png",
        "png",
        1,
        1,
        "etag-a",
        "ready",
        1,
        1,
      ],
    },
    {
      sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,detected_image_format,image_width,image_height,etag,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        "thumbnail-file-b",
        "thumbnail-org",
        "thumbnail-user",
        "thumbnail-upload-b",
        "issue",
        "thumbnail-object-b",
        "b.png",
        1,
        "image/png",
        "png",
        1,
        1,
        "etag-b",
        "ready",
        1,
        1,
      ],
    },
    {
      sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
      args: ["thumbnail-file-a", "thumbnail-org", "issue", "thumbnail-issue-a"],
    },
    {
      sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
      args: ["thumbnail-file-b", "thumbnail-org", "issue", "thumbnail-issue-b"],
    },
    {
      sql: "insert into issue_thumbnail_selections(organization_id,issue_id,file_id) values(?,?,?)",
      args: ["thumbnail-org", "thumbnail-issue-a", "thumbnail-file-a"],
    },
  ])
}

describe("新規DBのマイグレーション", () => {
  it("新規DBをcurrent schemaへ移行する", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle({ client })

    try {
      await migrate(db, { migrationsFolder })

      const [
        tables,
        indexes,
        triggers,
        ledger,
        foreignKeys,
        nullableTextPrimaryKeys,
      ] = await Promise.all([
        client.execute({
          sql: "select name from sqlite_master where type = ? order by name",
          args: ["table"],
        }),
        client.execute(
          "select name from sqlite_master where type = 'index' and tbl_name = 'member' order by name"
        ),
        client.execute(
          "select name from sqlite_master where type = 'trigger' order by name"
        ),
        client.execute(
          "select name from __drizzle_migrations order by applied_at"
        ),
        client.execute("pragma foreign_key_check"),
        client.execute(`
            select schema.name as table_name, columns.name as column_name
            from sqlite_schema as schema, pragma_table_info(schema.name) as columns
            where schema.type = 'table'
              and lower(columns.type) = 'text'
              and columns.pk > 0
              and columns."notnull" = 0
            order by schema.name, columns.pk
          `),
      ])
      expect(tables.rows.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "agent_assets",
          "agent_connection_tickets",
          "agent_grants",
          "agent_run_assets",
          "agent_runs",
          "agent_session_contexts",
          "agent_thread_permissions",
          "agent_threads",
          "audit_logs",
          "file_cleanup_jobs",
          "files",
          "issue_file_owners",
          "issue_thumbnail_selections",
          "organization_deletion_jobs",
          "organization_file_usage",
          "oauth_access_token",
          "oauth_client",
          "oauth_consent",
          "oauth_refresh_token",
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
          "member_organization_owner_uidx",
          "member_organization_user_uidx",
        ])
      )
      expect(triggers.rows.map(({ name }) => name)).toEqual(
        baselineTriggerNames
      )
      expect(ledger.rows).toHaveLength(1)
      expect(ledger.rows[0]?.name).toMatch(/_baseline$/)
      expect(foreignKeys.rows).toEqual([])
      expect(nullableTextPrimaryKeys.rows).toEqual([])
    } finally {
      client.close()
    }
  })

  describe("Issue thumbnail選択の不変条件", () => {
    let client: ReturnType<typeof createClient>

    beforeEach(async () => {
      client = createClient({ url: "file::memory:" })
      await migrate(drizzle({ client }), { migrationsFolder })
      await insertIssueThumbnailFixture(client)
    })

    afterEach(() => {
      client.close()
    })

    it("別Issueが所有するfileへの変更を拒否する", async () => {
      await expect(
        client.execute({
          sql: "update issue_thumbnail_selections set file_id = ? where organization_id = ? and issue_id = ?",
          args: ["thumbnail-file-b", "thumbnail-org", "thumbnail-issue-a"],
        })
      ).rejects.toThrow(/foreign key constraint failed/i)
    })

    it("thumbnail file削除時に選択をcascade削除する", async () => {
      await client.execute({
        sql: "delete from files where organization_id = ? and id = ?",
        args: ["thumbnail-org", "thumbnail-file-a"],
      })

      expect(
        (await client.execute("select file_id from issue_thumbnail_selections"))
          .rows
      ).toHaveLength(0)
      expect((await client.execute("pragma foreign_key_check")).rows).toEqual(
        []
      )
    })
  })

  describe("プロフィール画像の不変条件", () => {
    let client: ReturnType<typeof createClient>

    beforeEach(async () => {
      client = createClient({ url: "file::memory:" })
      await migrate(drizzle({ client }), { migrationsFolder })
      await insertProfileImageFixture(client)
    })

    afterEach(() => {
      client.close()
    })

    it("subjectごとにready画像を1件へ限定する", async () => {
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
    })

    it.each([
      {
        case: "subject種別と異なるowner",
        columns: "organization_id",
        owner: "profile-org",
      },
      {
        case: "ownerなし",
        columns: "user_id",
        owner: null,
      },
    ])("$caseのプロフィール画像を拒否する", async ({ columns, owner }) => {
      await expect(
        client.execute({
          sql: `insert into profile_images(id,subject_type,subject_id,${columns},upload_id,source_hash,version,object_key) values(?,?,?,?,?,?,?,?)`,
          args: [
            `profile-image-invalid-${columns}`,
            "user",
            "profile-user",
            owner,
            `upload-invalid-${columns}`,
            "c".repeat(64),
            2,
            `users/profile-user/profile-images/invalid-${columns}.webp`,
          ],
        })
      ).rejects.toThrow(/check constraint/i)
    })

    it("ready画像へetagを必須にする", async () => {
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
    })

    it("upload idを冪等性keyとして一意にする", async () => {
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
    })

    it("同じsubjectのsuperseded画像を履歴として保持する", async () => {
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
    })

    it("subject削除時に画像を削除してcleanup jobを保持する", async () => {
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
    })
  })
})
