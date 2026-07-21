import type { Db } from "@enterprise-agentic-saas/db"
import {
  fileCleanupJobs,
  files,
  issueFileOwners,
  issues,
  organizationFileUsage,
} from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { describe, expect, it } from "vitest"

import { deleteIssueById } from "./repository"

const createDatabase = async (): Promise<Db> => {
  const client = createClient({ url: "file::memory:?cache=shared" })
  await client.executeMultiple(`
    pragma foreign_keys = on;
    create table issues (
      id text primary key not null,
      organization_id text not null,
      number integer not null,
      title text not null,
      description text not null default '',
      status text not null default 'open',
      priority text not null default 'no_priority',
      assignee_id text,
      creator_id text not null,
      labels text not null default '[]',
      due_date integer,
      created_at integer not null,
      updated_at integer not null
    );
    create table files (
      id text primary key not null,
      organization_id text not null,
      uploader_id text not null,
      upload_id text not null,
      owner_type text not null,
      object_key text not null,
      filename text not null,
      size_bytes integer not null,
      declared_content_type text not null,
      detected_image_format text,
      image_width integer,
      image_height integer,
      etag text,
      status text not null default 'pending',
      storage_object_id text,
      key_version integer,
      created_at integer not null,
      updated_at integer not null,
      constraint files_storage_v2_check check (
        (storage_object_id is null and key_version is null)
        or (
          storage_object_id is not null
          and key_version is not null
          and key_version in (1, 2)
        )
      )
    );
    create unique index files_storage_object_uidx
      on files(storage_object_id) where storage_object_id is not null;
    create table issue_file_owners (
      file_id text primary key not null references files(id) on delete cascade,
      organization_id text not null,
      owner_type text not null default 'issue',
      issue_id text not null references issues(id) on delete cascade
    );
    create table organization_file_usage (
      organization_id text primary key not null,
      used_bytes integer not null default 0,
      temporary_bytes integer not null default 0,
      updated_at integer not null,
      constraint organization_file_usage_temporary_bytes_check check (
        temporary_bytes between 0 and used_bytes
      )
    );
    create table file_cleanup_jobs (
      id text primary key not null,
      organization_id text not null,
      kind text not null,
      object_key text,
      prefix text,
      status text not null default 'pending',
      attempts integer not null default 0,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      completed_at integer
    );
    create unique index file_cleanup_jobs_prefix_uidx
      on file_cleanup_jobs(prefix) where kind = 'owner_prefix';
    create table audit_logs (
      id text primary key not null,
      organization_id text not null,
      actor_user_id text,
      action text not null,
      target_type text not null,
      target_id text,
      metadata text not null default '{}',
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    );
  `)
  return drizzle(client)
}

describe("issue file cleanup", () => {
  it("deletes pending and ready rows, releases usage, and queues the owner prefix atomically", async () => {
    const database = await createDatabase()
    const now = new Date("2026-07-18T00:00:00.000Z")
    await database.insert(issues).values({
      id: "issue-1",
      organizationId: "org/acme",
      number: 1,
      title: "Issue",
      creatorId: "user-1",
      createdAt: now,
      updatedAt: now,
    })
    await database.insert(files).values([
      {
        id: "file-pending",
        organizationId: "org/acme",
        uploaderId: "user-1",
        uploadId: "upload-pending",
        ownerType: "issue",
        objectKey: "organizations/org%2Facme/files/issue/issue-1/file-pending",
        filename: "pending.txt",
        sizeBytes: 10,
        declaredContentType: "text/plain",
        status: "pending",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "file-ready",
        organizationId: "org/acme",
        uploaderId: "user-1",
        uploadId: "upload-ready",
        ownerType: "issue",
        objectKey: "organizations/org%2Facme/files/issue/issue-1/file-ready",
        filename: "ready.txt",
        sizeBytes: 20,
        declaredContentType: "text/plain",
        etag: "etag",
        status: "ready",
        createdAt: now,
        updatedAt: now,
      },
    ])
    await database.insert(issueFileOwners).values([
      {
        fileId: "file-pending",
        organizationId: "org/acme",
        ownerType: "issue",
        issueId: "issue-1",
      },
      {
        fileId: "file-ready",
        organizationId: "org/acme",
        ownerType: "issue",
        issueId: "issue-1",
      },
    ])
    await database.insert(organizationFileUsage).values({
      organizationId: "org/acme",
      usedBytes: 30,
      updatedAt: now,
    })

    await expect(
      deleteIssueById(database, {
        actorUserId: "user-1",
        id: "issue-1",
        organizationId: "org/acme",
      })
    ).resolves.toMatchObject({ id: "issue-1" })

    await expect(database.select().from(files)).resolves.toEqual([])
    await expect(database.select().from(issueFileOwners)).resolves.toEqual([])
    await expect(
      database.select().from(organizationFileUsage)
    ).resolves.toMatchObject([{ usedBytes: 0 }])
    await expect(
      database.select().from(fileCleanupJobs)
    ).resolves.toMatchObject([
      {
        kind: "owner_prefix",
        organizationId: "org/acme",
        prefix: "organizations/org%2Facme/files/issue/issue-1/",
        status: "pending",
      },
    ])
  })
})
