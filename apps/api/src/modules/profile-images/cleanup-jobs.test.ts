import type { Db } from "@enterprise-agentic-saas/db"
import {
  profileImageCleanupJobs,
  profileImages,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createMigratedDb } from "../../app.test-support"
import {
  processProfileImageCleanupJobs,
  type ProfileImageCleanupBucket,
} from "./cleanup-jobs"

const now = new Date("2026-07-22T00:00:00.000Z")

const bucket = (): ProfileImageCleanupBucket => ({
  delete: vi.fn<ProfileImageCleanupBucket["delete"]>().mockResolvedValue(),
})

describe("プロフィール画像cleanup job", () => {
  let database: Db

  beforeEach(async () => {
    database = await createMigratedDb()
    await database.insert(user).values({
      id: "user-1",
      name: "User One",
      email: "user-1@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
  })

  it.each([
    {
      label: "user画像",
      subjectType: "user" as const,
      subjectId: "user/acme",
      objectKey: "users/user%2Facme/profile-images/image-1.webp",
    },
    {
      label: "organization画像",
      subjectType: "organization" as const,
      subjectId: "org/acme",
      objectKey: "organizations/org%2Facme/profile-images/image-2.webp",
    },
  ])(
    "canonicalな$label keyをlease fencing付きで削除する",
    async ({ label: _label, ...row }) => {
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
    }
  )

  it("subject外のtargetを削除しない", async () => {
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

  it("安定error codeだけを保存してbackoff付きで再試行する", async () => {
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

  it("放棄されたpending uploadをdurable cleanup jobへexpireする", async () => {
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
