import type { Db } from "@enterprise-agentic-saas/db"
import { fileCleanupJobs } from "@enterprise-agentic-saas/db/schema"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createMigratedDb } from "../../app.test-support"
import { processFileCleanupJobs, type FileCleanupBucket } from "./cleanup-jobs"

const now = new Date("2026-07-18T00:00:00.000Z")

const bucket = (): FileCleanupBucket => ({
  delete: vi.fn<FileCleanupBucket["delete"]>().mockResolvedValue(undefined),
  list: vi.fn<FileCleanupBucket["list"]>().mockResolvedValue({
    objects: [],
    truncated: false,
  }),
})

describe("file cleanup jobの契約", () => {
  let database: Db

  beforeEach(async () => {
    database = await createMigratedDb()
  })

  it("正確なimmutable objectを削除してcompletionをfenceする", async () => {
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

  it("owner prefix配下の全pageを削除して返却keyを検証する", async () => {
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

  it("破損したcross-tenant targetではR2へ触れない", async () => {
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

  it("tenant prefix内の非canonical dot-segment targetを拒否する", async () => {
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

  it("安定error codeだけを保存してbackoff付きで再試行する", async () => {
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
