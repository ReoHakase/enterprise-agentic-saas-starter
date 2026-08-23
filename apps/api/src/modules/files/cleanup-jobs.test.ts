import type { Db } from "@enterprise-agentic-saas/db"
import { fileCleanupJobs } from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { processFileCleanupJobs, type FileCleanupBucket } from "./cleanup-jobs"

const now = new Date("2026-07-18T00:00:00.000Z")

const createDatabase = async (): Promise<Db> => {
  const client = createClient({ url: ":memory:" })
  await client.executeMultiple(`
    create table file_cleanup_jobs (
      id text primary key not null,
      organization_id text not null,
      kind text not null,
      object_key text,
      prefix text,
      status text default 'pending' not null,
      attempts integer default 0 not null,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      created_at integer not null,
      completed_at integer
    );
  `)
  return drizzle({ client })
}

const bucket = (): FileCleanupBucket => ({
  delete: vi.fn<FileCleanupBucket["delete"]>().mockResolvedValue(undefined),
  list: vi.fn<FileCleanupBucket["list"]>().mockResolvedValue({
    objects: [],
    truncated: false,
  }),
})

describe("file cleanup jobs", () => {
  let database: Db

  beforeEach(async () => {
    database = await createDatabase()
  })

  it("deletes an exact immutable object and fences completion", async () => {
    await database.insert(fileCleanupJobs).values({
      id: "cleanup-1",
      organizationId: "org/acme",
      kind: "exact",
      objectKey: "organizations/org%2Facme/files/issue/issue-1/file-1",
      createdAt: now,
    })
    const storage = bucket()

    await expect(
      processFileCleanupJobs({ bucket: storage, database, now })
    ).resolves.toEqual({ claimed: 1, completed: 1, failed: 0, stale: 0 })
    expect(storage.delete).toHaveBeenCalledWith(
      "organizations/org%2Facme/files/issue/issue-1/file-1"
    )
    await expect(
      database.select().from(fileCleanupJobs)
    ).resolves.toMatchObject([
      { attempts: 1, completedAt: now, status: "completed" },
    ])
  })

  it("deletes every owner-prefix page and validates returned keys", async () => {
    await database.insert(fileCleanupJobs).values({
      id: "cleanup-2",
      organizationId: "org/acme",
      kind: "owner_prefix",
      prefix: "organizations/org%2Facme/files/issue/issue-1/",
      createdAt: now,
    })
    const storage = bucket()
    vi.mocked(storage.list)
      .mockResolvedValueOnce({
        objects: [
          { key: "organizations/org%2Facme/files/issue/issue-1/file-1" },
        ],
        truncated: true,
        cursor: "next",
      })
      .mockResolvedValueOnce({
        objects: [
          { key: "organizations/org%2Facme/files/issue/issue-1/file-2" },
        ],
        truncated: false,
      })

    await expect(
      processFileCleanupJobs({ bucket: storage, database, now })
    ).resolves.toEqual({ claimed: 1, completed: 1, failed: 0, stale: 0 })
    expect(storage.delete).toHaveBeenNthCalledWith(1, [
      "organizations/org%2Facme/files/issue/issue-1/file-1",
    ])
    expect(storage.delete).toHaveBeenNthCalledWith(2, [
      "organizations/org%2Facme/files/issue/issue-1/file-2",
    ])
  })

  it("never touches R2 for a corrupted cross-tenant target", async () => {
    await database.insert(fileCleanupJobs).values({
      id: "cleanup-corrupt",
      organizationId: "org/acme",
      kind: "exact",
      objectKey: "organizations/another/files/issue/issue-1/file-1",
      createdAt: now,
    })
    const storage = bucket()

    await expect(
      processFileCleanupJobs({ bucket: storage, database, now })
    ).resolves.toEqual({ claimed: 1, completed: 0, failed: 1, stale: 0 })
    expect(storage.delete).not.toHaveBeenCalled()
    expect(storage.list).not.toHaveBeenCalled()
    await expect(
      database.select().from(fileCleanupJobs)
    ).resolves.toMatchObject([
      {
        attempts: 1,
        lastErrorCode: "r2_cleanup_failed",
        status: "failed",
      },
    ])
  })

  it("rejects noncanonical dot-segment targets inside the tenant prefix", async () => {
    await database.insert(fileCleanupJobs).values({
      id: "cleanup-dot-segment",
      organizationId: "org/acme",
      kind: "exact",
      objectKey: "organizations/org%2Facme/files/issue/../other",
      createdAt: now,
    })
    const storage = bucket()

    await expect(
      processFileCleanupJobs({ bucket: storage, database, now })
    ).resolves.toEqual({ claimed: 1, completed: 0, failed: 1, stale: 0 })
    expect(storage.delete).not.toHaveBeenCalled()
    expect(storage.list).not.toHaveBeenCalled()
  })

  it("stores only a stable error code and retries with backoff", async () => {
    await database.insert(fileCleanupJobs).values({
      id: "cleanup-failure",
      organizationId: "org/acme",
      kind: "exact",
      objectKey: "organizations/org%2Facme/files/issue/issue-1/file-1",
      createdAt: now,
    })
    const storage = bucket()
    vi.mocked(storage.delete).mockRejectedValue(
      new Error("provider secret and object detail")
    )

    await expect(
      processFileCleanupJobs({ bucket: storage, database, now })
    ).resolves.toEqual({ claimed: 1, completed: 0, failed: 1, stale: 0 })
    const [stored] = await database.select().from(fileCleanupJobs)
    expect(stored).toMatchObject({
      attempts: 1,
      lastErrorCode: "r2_cleanup_failed",
      nextAttemptAt: new Date(now.getTime() + 30_000),
      status: "failed",
    })
    expect(JSON.stringify(stored)).not.toContain("provider secret")
  })
})
