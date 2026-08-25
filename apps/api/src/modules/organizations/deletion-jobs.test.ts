import type { Db } from "@enterprise-agentic-saas/db"
import { organizationDeletionJobs } from "@enterprise-agentic-saas/db/schema"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createMigratedDb } from "../../app.test-support"
import {
  deleteOrganizationFiles,
  processOrganizationDeletionJobs,
  type OrganizationFilesBucket,
} from "./deletion-jobs"

const now = new Date("2026-07-14T00:00:00.000Z")

const insertJob = async (database: Db) => {
  await database.insert(organizationDeletionJobs).values({
    id: "deletion-1",
    organizationId: "org/acme",
    requestedByUserId: "user-1",
    idempotencyKey: "request-1",
    requestedAt: now,
  })
}

describe("organization削除時のfile cleanup", () => {
  let database: Db

  beforeEach(async () => {
    database = await createMigratedDb()
    await insertJob(database)
  })

  it("tenant prefix配下だけの全pagination objectを削除する", async () => {
    const list = vi
      .fn<OrganizationFilesBucket["list"]>()
      .mockResolvedValueOnce({
        objects: [{ key: "organizations/org%2Facme/a" }],
        truncated: true,
        cursor: "next",
      })
      .mockResolvedValueOnce({
        objects: [{ key: "organizations/org%2Facme/b" }],
        truncated: false,
      })
    const remove = vi
      .fn<OrganizationFilesBucket["delete"]>()
      .mockResolvedValue(undefined)

    await expect(
      deleteOrganizationFiles({ list, delete: remove }, "org/acme")
    ).resolves.toBe(2)

    expect(list).toHaveBeenNthCalledWith(1, {
      prefix: "organizations/org%2Facme/",
      cursor: undefined,
      limit: 1000,
    })
    expect(remove).toHaveBeenNthCalledWith(1, ["organizations/org%2Facme/a"])
    expect(remove).toHaveBeenNthCalledWith(2, ["organizations/org%2Facme/b"])
  })

  it("R2がcontinuation cursorなしでpageをtruncateした場合はfail closedにする", async () => {
    const bucket: OrganizationFilesBucket = {
      list: vi.fn<OrganizationFilesBucket["list"]>().mockResolvedValue({
        objects: [],
        truncated: true,
      }),
      delete: vi
        .fn<OrganizationFilesBucket["delete"]>()
        .mockResolvedValue(undefined),
    }

    await expect(deleteOrganizationFiles(bucket, "org/acme")).rejects.toThrow(
      "R2 returned a truncated page without a cursor"
    )
  })

  it("encode済みtenant prefix外のobjectを削除しない", async () => {
    const remove = vi
      .fn<OrganizationFilesBucket["delete"]>()
      .mockResolvedValue(undefined)
    const bucket: OrganizationFilesBucket = {
      list: vi.fn<OrganizationFilesBucket["list"]>().mockResolvedValue({
        objects: [{ key: "organizations/another-tenant/private.txt" }],
        truncated: false,
      }),
      delete: remove,
    }

    await expect(deleteOrganizationFiles(bucket, "org/acme")).rejects.toThrow(
      "R2 returned an object outside the requested prefix"
    )
    expect(remove).not.toHaveBeenCalled()
  })

  it("成功したdurable jobをcompletedにする", async () => {
    const bucket: OrganizationFilesBucket = {
      list: vi.fn<OrganizationFilesBucket["list"]>().mockResolvedValue({
        objects: [],
        truncated: false,
      }),
      delete: vi
        .fn<OrganizationFilesBucket["delete"]>()
        .mockResolvedValue(undefined),
    }

    await expect(
      processOrganizationDeletionJobs({ bucket, database, now })
    ).resolves.toEqual({ claimed: 1, completed: 1, failed: 0, stale: 0 })

    await expect(
      database.select().from(organizationDeletionJobs)
    ).resolves.toMatchObject([
      {
        attempts: 1,
        completedAt: now,
        lastErrorCode: null,
        status: "completed",
      },
    ])
  })

  it("安全なerror codeだけを保存してR2失敗後のretryをscheduleする", async () => {
    const bucket: OrganizationFilesBucket = {
      list: vi
        .fn<OrganizationFilesBucket["list"]>()
        .mockRejectedValue(new Error("secret bucket detail")),
      delete: vi
        .fn<OrganizationFilesBucket["delete"]>()
        .mockResolvedValue(undefined),
    }

    await expect(
      processOrganizationDeletionJobs({ bucket, database, now })
    ).resolves.toEqual({ claimed: 1, completed: 0, failed: 1, stale: 0 })

    const [job] = await database.select().from(organizationDeletionJobs)
    expect(job).toMatchObject({
      attempts: 1,
      lastErrorCode: "r2_cleanup_failed",
      status: "failed",
    })
    expect(job?.nextAttemptAt).toEqual(new Date(now.getTime() + 30_000))
    expect(JSON.stringify(job)).not.toContain("secret bucket detail")

    await expect(
      processOrganizationDeletionJobs({ bucket, database, now })
    ).resolves.toEqual({ claimed: 0, completed: 0, failed: 0, stale: 0 })
    expect(bucket.list).toHaveBeenCalledOnce()

    const firstRetryAt = new Date(now.getTime() + 30_000)
    await expect(
      processOrganizationDeletionJobs({
        bucket,
        database,
        now: firstRetryAt,
      })
    ).resolves.toEqual({ claimed: 1, completed: 0, failed: 1, stale: 0 })
    const [retriedJob] = await database.select().from(organizationDeletionJobs)
    expect(retriedJob).toMatchObject({ attempts: 2, status: "failed" })
    expect(retriedJob?.nextAttemptAt).toEqual(
      new Date(firstRetryAt.getTime() + 60_000)
    )
  })

  it("lease期限後だけprocessing jobをreclaimする", async () => {
    await database.update(organizationDeletionJobs).set({
      attempts: 1,
      lockedAt: new Date(now.getTime() - 5 * 60 * 1000 - 1),
      status: "processing",
    })
    const bucket: OrganizationFilesBucket = {
      list: vi.fn<OrganizationFilesBucket["list"]>().mockResolvedValue({
        objects: [],
        truncated: false,
      }),
      delete: vi
        .fn<OrganizationFilesBucket["delete"]>()
        .mockResolvedValue(undefined),
    }

    await expect(
      processOrganizationDeletionJobs({ bucket, database, now })
    ).resolves.toEqual({ claimed: 1, completed: 1, failed: 0, stale: 0 })
    await expect(
      database.select().from(organizationDeletionJobs)
    ).resolves.toMatchObject([
      { attempts: 2, completedAt: now, status: "completed" },
    ])
  })

  it("期限切れworkerに新しいworkerがclaimしたleaseをcompleteさせない", async () => {
    type ListResult = Awaited<ReturnType<OrganizationFilesBucket["list"]>>
    let resolveList: ((result: ListResult) => void) | undefined
    const pendingList = new Promise<ListResult>((resolve) => {
      resolveList = resolve
    })
    const list = vi
      .fn<OrganizationFilesBucket["list"]>()
      .mockReturnValue(pendingList)
    const bucket: OrganizationFilesBucket = {
      list,
      delete: vi
        .fn<OrganizationFilesBucket["delete"]>()
        .mockResolvedValue(undefined),
    }

    const oldWorker = processOrganizationDeletionJobs({
      bucket,
      database,
      now,
    })
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())

    const newerLease = new Date(now.getTime() + 5 * 60 * 1000 + 1)
    await database.update(organizationDeletionJobs).set({
      attempts: 2,
      lockedAt: newerLease,
      status: "processing",
    })
    expect(resolveList).toBeTypeOf("function")
    resolveList?.({ objects: [], truncated: false })

    await expect(oldWorker).resolves.toEqual({
      claimed: 1,
      completed: 0,
      failed: 0,
      stale: 1,
    })
    await expect(
      database.select().from(organizationDeletionJobs)
    ).resolves.toMatchObject([
      {
        attempts: 2,
        completedAt: null,
        lockedAt: newerLease,
        status: "processing",
      },
    ])
  })

  it("期限切れworkerに新しいworkerがcompleteしたjobをfailさせない", async () => {
    let rejectList: ((reason: unknown) => void) | undefined
    const pendingList = new Promise<never>((_resolve, reject) => {
      rejectList = reject
    })
    const list = vi
      .fn<OrganizationFilesBucket["list"]>()
      .mockReturnValue(pendingList)
    const onFailure = vi.fn()
    const bucket: OrganizationFilesBucket = {
      list,
      delete: vi
        .fn<OrganizationFilesBucket["delete"]>()
        .mockResolvedValue(undefined),
    }

    const oldWorker = processOrganizationDeletionJobs({
      bucket,
      database,
      now,
      onFailure,
    })
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce())

    const completedAt = new Date(now.getTime() + 5 * 60 * 1000 + 1)
    await database.update(organizationDeletionJobs).set({
      attempts: 2,
      completedAt,
      lockedAt: null,
      status: "completed",
    })
    expect(rejectList).toBeTypeOf("function")
    rejectList?.(new Error("expired worker failure"))

    await expect(oldWorker).resolves.toEqual({
      claimed: 1,
      completed: 0,
      failed: 0,
      stale: 1,
    })
    expect(onFailure).not.toHaveBeenCalled()
    await expect(
      database.select().from(organizationDeletionJobs)
    ).resolves.toMatchObject([
      {
        attempts: 2,
        completedAt,
        lastErrorCode: null,
        status: "completed",
      },
    ])
  })
})
