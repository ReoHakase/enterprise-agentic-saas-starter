import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { invitationEmailJobStatuses } from "../schema/app"
import { migrationsFolder } from "./helpers"

describe("database migrations: fresh", () => {
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
          "agent_thread_permissions",
          "agent_threads",
          "audit_logs",
          "file_cleanup_jobs",
          "files",
          "invitation_email_jobs",
          "issue_file_owners",
          "issue_thumbnail_selections",
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

  it("keeps Issue thumbnail selections tenant- and owner-bound", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
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
          args: [
            "thumbnail-file-a",
            "thumbnail-org",
            "issue",
            "thumbnail-issue-a",
          ],
        },
        {
          sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
          args: [
            "thumbnail-file-b",
            "thumbnail-org",
            "issue",
            "thumbnail-issue-b",
          ],
        },
        {
          sql: "insert into issue_thumbnail_selections(organization_id,issue_id,file_id) values(?,?,?)",
          args: ["thumbnail-org", "thumbnail-issue-a", "thumbnail-file-a"],
        },
      ])

      await expect(
        client.execute({
          sql: "update issue_thumbnail_selections set file_id = ? where organization_id = ? and issue_id = ?",
          args: ["thumbnail-file-b", "thumbnail-org", "thumbnail-issue-a"],
        })
      ).rejects.toThrow(/foreign key constraint failed/i)

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
    } finally {
      client.close()
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
})
