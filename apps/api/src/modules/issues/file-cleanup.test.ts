import type { Db } from "@enterprise-agentic-saas/db"
import {
  fileCleanupJobs,
  files,
  issueFileOwners,
  issues,
  organization,
  organizationFileUsage,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { describe, expect, it } from "vitest"

import { createMigratedDb } from "../../app.test-support"
import { deleteIssueById } from "./repository"

const createDatabase = async (): Promise<Db> => {
  const database = await createMigratedDb()
  const now = new Date("2026-07-18T00:00:00.000Z")
  await database.insert(user).values({
    id: "user-1",
    name: "User One",
    email: "user-1@example.test",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  await database.insert(organization).values({
    id: "org/acme",
    name: "Org Acme",
    slug: "org-acme",
    createdAt: now,
  })
  return database
}

describe("Issue file cleanupの契約", () => {
  it("pendingとready rowを削除してusageを解放しowner prefixを原子的にqueueへ積む", async () => {
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
