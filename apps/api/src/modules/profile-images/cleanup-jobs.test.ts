import type { Db } from "@enterprise-agentic-saas/db"
import {
  profileImageCleanupJobs,
  profileImages,
} from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  processProfileImageCleanupJobs,
  type ProfileImageCleanupBucket,
} from "./cleanup-jobs"

const now = new Date("2026-07-22T00:00:00.000Z")

const createDatabase = async (): Promise<Db> => {
  const client = createClient({ url: "file::memory:?cache=shared" })
  await client.executeMultiple(`
    drop table if exists profile_image_cleanup_jobs;
    drop table if exists profile_images;
    create table profile_images (
      id text primary key,
      subject_type text not null,
      subject_id text not null,
      user_id text,
      organization_id text,
      upload_id text not null,
      source_hash text not null,
      version integer not null,
      object_key text not null unique,
      fallback_url text,
      etag text,
      status text default 'pending' not null,
      created_at integer not null,
      updated_at integer not null
    );
    create table profile_image_cleanup_jobs (
      id text primary key not null,
      subject_type text not null,
      subject_id text not null,
      object_key text not null unique,
      status text default 'pending' not null,
      attempts integer default 0 not null,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      created_at integer not null,
      completed_at integer
    );
  `)
  return drizzle(client)
}

const bucket = (): ProfileImageCleanupBucket => ({
  delete: vi.fn<ProfileImageCleanupBucket["delete"]>().mockResolvedValue(),
})

describe("profile image cleanup jobs", () => {
  let database: Db

  beforeEach(async () => {
    database = await createDatabase()
  })

  it.each([
    {
      subjectType: "user" as const,
      subjectId: "user/acme",
      objectKey: "users/user%2Facme/profile-images/image-1.webp",
    },
    {
      subjectType: "organization" as const,
      subjectId: "org/acme",
      objectKey: "organizations/org%2Facme/profile-images/image-2.webp",
    },
  ])("deletes a canonical $subjectType key with lease fencing", async (row) => {
    await database.insert(profileImageCleanupJobs).values({
      id: `cleanup-${row.subjectType}`,
      ...row,
      createdAt: now,
    })
    const storage = bucket()

    await expect(
      processProfileImageCleanupJobs({ bucket: storage, database, now })
    ).resolves.toEqual({
      claimed: 1,
      completed: 1,
      expired: 0,
      failed: 0,
      stale: 0,
    })
    expect(storage.delete).toHaveBeenCalledWith(row.objectKey)
    await expect(
      database.select().from(profileImageCleanupJobs)
    ).resolves.toMatchObject([
      { attempts: 1, completedAt: now, status: "completed" },
    ])
  })

  it("never deletes a cross-subject or malformed target", async () => {
    await database.insert(profileImageCleanupJobs).values({
      id: "cleanup-corrupt",
      subjectType: "user",
      subjectId: "user-1",
      objectKey: "users/user-2/profile-images/image.webp",
      createdAt: now,
    })
    const storage = bucket()

    await expect(
      processProfileImageCleanupJobs({ bucket: storage, database, now })
    ).resolves.toEqual({
      claimed: 1,
      completed: 0,
      expired: 0,
      failed: 1,
      stale: 0,
    })
    expect(storage.delete).not.toHaveBeenCalled()
  })

  it("stores only a stable error code and retries with backoff", async () => {
    await database.insert(profileImageCleanupJobs).values({
      id: "cleanup-failure",
      subjectType: "organization",
      subjectId: "org-1",
      objectKey: "organizations/org-1/profile-images/image.webp",
      createdAt: now,
    })
    const storage = bucket()
    vi.mocked(storage.delete).mockRejectedValue(
      new Error("provider secret and object detail")
    )

    await expect(
      processProfileImageCleanupJobs({ bucket: storage, database, now })
    ).resolves.toEqual({
      claimed: 1,
      completed: 0,
      expired: 0,
      failed: 1,
      stale: 0,
    })
    const [stored] = await database.select().from(profileImageCleanupJobs)
    expect(stored).toMatchObject({
      attempts: 1,
      lastErrorCode: "r2_cleanup_failed",
      nextAttemptAt: new Date(now.getTime() + 30_000),
      status: "failed",
    })
    expect(JSON.stringify(stored)).not.toContain("provider secret")
  })

  it("expires an abandoned pending upload into a durable cleanup job", async () => {
    await database.insert(profileImages).values({
      id: "profile-abandoned",
      subjectType: "user",
      subjectId: "user-1",
      userId: "user-1",
      uploadId: "upload-abandoned",
      sourceHash: "a".repeat(64),
      version: 1,
      objectKey: "users/user-1/profile-images/profile-abandoned.webp",
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    })
    const storage = bucket()

    await expect(
      processProfileImageCleanupJobs({ bucket: storage, database, now })
    ).resolves.toEqual({
      claimed: 1,
      completed: 1,
      expired: 1,
      failed: 0,
      stale: 0,
    })
    expect(storage.delete).toHaveBeenCalledWith(
      "users/user-1/profile-images/profile-abandoned.webp"
    )
    await expect(database.select().from(profileImages)).resolves.toMatchObject([
      { id: "profile-abandoned", status: "superseded" },
    ])
  })
})
