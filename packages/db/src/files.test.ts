import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import {
  developmentFileFixtures,
  getDevelopmentFileFixtureUrl,
  selectDevelopmentFileFixturesForReconciliation,
} from "./development-seed"
import { seedDevelopmentDatabase } from "./seed"

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname

const readDevelopmentSeedSnapshot = async (connection: { url: string }) => {
  const client = createClient(connection)

  try {
    const tableQueries = {
      users:
        "select id,name,email,email_verified,image,created_at,updated_at from user order by id",
      organizations:
        "select id,name,slug,logo,created_at,metadata from organization order by id",
      accounts:
        "select id,account_id,provider_id,user_id,created_at,updated_at from account order by id",
      members:
        "select id,organization_id,user_id,role,created_at from member order by id",
      invitations:
        "select id,organization_id,email,role,status,expires_at,created_at,inviter_id from invitation order by id",
      issues:
        "select id,organization_id,number,title,description,status,priority,assignee_id,creator_id,labels,due_date,created_at,updated_at from issues order by id",
      comments:
        "select id,issue_id,organization_id,author_id,body,created_at,updated_at from issue_comments order by id",
      files:
        "select id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,status,created_at,updated_at from files order by id",
      owners:
        "select file_id,organization_id,owner_type,issue_id from issue_file_owners order by file_id",
      usage:
        "select organization_id,used_bytes,updated_at from organization_file_usage order by organization_id",
    } as const
    const entries = await Promise.all(
      Object.entries(tableQueries).map(async ([key, sql]) => [
        key,
        (await client.execute(sql)).rows,
      ])
    )
    return Object.fromEntries(entries)
  } finally {
    client.close()
  }
}

const insertTenantFixture = async (client: ReturnType<typeof createClient>) => {
  const now = Date.now()
  await client.batch([
    {
      sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
      args: ["file-user", "File User", "file@example.com", 1, now, now],
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
      sql: "insert into issues(id,organization_id,number,title,creator_id) values(?,?,?,?,?)",
      args: ["file-issue-a", "file-org-a", 1, "Issue A", "file-user"],
    },
    {
      sql: "insert into issues(id,organization_id,number,title,creator_id) values(?,?,?,?,?)",
      args: ["file-issue-b", "file-org-b", 1, "Issue B", "file-user"],
    },
  ])
}

const insertPendingFile = (
  client: ReturnType<typeof createClient>,
  input: {
    id: string
    organizationId: string
    uploadId: string
    objectKey: string
    sizeBytes?: number
    ownerType?: string
    status?: string
  }
) =>
  client.execute({
    sql: "insert into files(id,organization_id,uploader_id,upload_id,owner_type,object_key,filename,size_bytes,declared_content_type,status) values(?,?,?,?,?,?,?,?,?,?)",
    args: [
      input.id,
      input.organizationId,
      "file-user",
      input.uploadId,
      input.ownerType ?? "issue",
      input.objectKey,
      "fixture.bin",
      input.sizeBytes ?? 1,
      "application/octet-stream",
      input.status ?? "pending",
    ],
  })

describe("file storage schema", () => {
  it("keeps file ownership inside the same tenant and scopes upload idempotency", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
      await insertTenantFixture(client)
      await insertPendingFile(client, {
        id: "file-a",
        organizationId: "file-org-a",
        uploadId: "upload-shared",
        objectKey: "organizations/file-org-a/files/issue/file-issue-a/file-a",
      })
      await client.execute({
        sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
        args: ["file-a", "file-org-a", "issue", "file-issue-a"],
      })

      await expect(
        insertPendingFile(client, {
          id: "file-a-duplicate-upload",
          organizationId: "file-org-a",
          uploadId: "upload-shared",
          objectKey:
            "organizations/file-org-a/files/issue/file-issue-a/file-a-duplicate-upload",
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        insertPendingFile(client, {
          id: "file-b",
          organizationId: "file-org-b",
          uploadId: "upload-shared",
          objectKey: "organizations/file-org-b/files/issue/file-issue-b/file-b",
        })
      ).resolves.toBeDefined()
      await expect(
        client.execute({
          sql: "insert into issue_file_owners(file_id,organization_id,owner_type,issue_id) values(?,?,?,?)",
          args: ["file-b", "file-org-b", "issue", "file-issue-a"],
        })
      ).rejects.toThrow(/foreign key/i)
    } finally {
      client.close()
    }
  })

  it("enforces file, quota, and durable cleanup job invariants", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
      await insertTenantFixture(client)

      await expect(
        insertPendingFile(client, {
          id: "oversized-file",
          organizationId: "file-org-a",
          uploadId: "oversized-upload",
          objectKey:
            "organizations/file-org-a/files/issue/file-issue-a/oversized-file",
          sizeBytes: 20_000_001,
        })
      ).rejects.toThrow(/check constraint/i)
      await expect(
        insertPendingFile(client, {
          id: "invalid-owner-file",
          organizationId: "file-org-a",
          uploadId: "invalid-owner-upload",
          objectKey:
            "organizations/file-org-a/files/issue/file-issue-a/invalid-owner-file",
          ownerType: "project",
        })
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute({
          sql: "insert into organization_file_usage(organization_id,used_bytes) values(?,?)",
          args: ["file-org-a", 1_073_741_825],
        })
      ).rejects.toThrow(/check constraint/i)

      await client.batch([
        {
          sql: "insert into file_cleanup_jobs(id,organization_id,kind,object_key) values(?,?,?,?)",
          args: [
            "cleanup-exact",
            "file-org-a",
            "exact",
            "organizations/file-org-a/files/issue/file-issue-a/file-a",
          ],
        },
        {
          sql: "insert into file_cleanup_jobs(id,organization_id,kind,prefix) values(?,?,?,?)",
          args: [
            "cleanup-prefix",
            "file-org-a",
            "owner_prefix",
            "organizations/file-org-a/files/issue/file-issue-a/",
          ],
        },
      ])
      await expect(
        client.execute({
          sql: "insert into file_cleanup_jobs(id,organization_id,kind,object_key,prefix) values(?,?,?,?,?)",
          args: [
            "cleanup-invalid-target",
            "file-org-a",
            "exact",
            "object-key",
            "prefix/",
          ],
        })
      ).rejects.toThrow(/check constraint/i)
      await expect(
        client.execute({
          sql: "insert into file_cleanup_jobs(id,organization_id,kind,object_key) values(?,?,?,?)",
          args: [
            "cleanup-duplicate",
            "file-org-a",
            "exact",
            "organizations/file-org-a/files/issue/file-issue-a/file-a",
          ],
        })
      ).rejects.toThrow(/unique/i)

      await client.execute("delete from organization where id = 'file-org-a'")
      const cleanupJobs = await client.execute(
        "select id from file_cleanup_jobs order by id"
      )
      expect(cleanupJobs.rows).toMatchObject([
        { id: "cleanup-exact" },
        { id: "cleanup-prefix" },
      ])
    } finally {
      client.close()
    }
  })
})

describe("development file fixtures", () => {
  it("matches committed bytes, paths, digests, and tenant key layout", async () => {
    expect(
      new Set(developmentFileFixtures.map((file) => file.organizationId)).size
    ).toBe(2)

    await Promise.all(
      developmentFileFixtures.map(async (fixture) => {
        const bytes = await readFile(getDevelopmentFileFixtureUrl(fixture))
        expect(bytes).toHaveLength(fixture.sizeBytes)
        expect(createHash("md5").update(bytes).digest("hex")).toBe(fixture.md5)
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(
          fixture.sha256
        )
        expect(fixture.objectKey).toBe(
          `organizations/${fixture.organizationId}/files/${fixture.ownerType}/${fixture.ownerId}/${fixture.id}`
        )
      })
    )
  })

  it("reconciles only existing manifest rows and rejects drift", () => {
    const fixture = developmentFileFixtures[0]
    if (!fixture) throw new Error("Development fixture manifest is empty")
    const row = {
      id: fixture.id,
      organizationId: fixture.organizationId,
      uploadId: fixture.uploadId,
      objectKey: fixture.objectKey,
    }

    expect(selectDevelopmentFileFixturesForReconciliation([])).toEqual([])
    expect(selectDevelopmentFileFixturesForReconciliation([row])).toEqual([
      fixture,
    ])
    expect(
      selectDevelopmentFileFixturesForReconciliation([
        {
          id: "unmanaged-file",
          organizationId: "some-org",
          uploadId: "some-upload",
          objectKey: "some-key",
        },
      ])
    ).toEqual([])
    expect(() =>
      selectDevelopmentFileFixturesForReconciliation([
        { ...row, objectKey: "organizations/drifted" },
      ])
    ).toThrow(/does not match the committed manifest/i)
  })

  it("does not recreate a deleted seed file during a normal rerun", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "enterprise-saas-file-seed-")
    )
    const databasePath = join(directory, "seed.db")
    const connection = { url: `file:${databasePath}` }
    const client = createClient(connection)

    try {
      await migrate(drizzle(client), { migrationsFolder })
      client.close()
      await seedDevelopmentDatabase(connection)

      const mutationClient = createClient(connection)
      const deletedFixture = developmentFileFixtures[0]
      if (!deletedFixture)
        throw new Error("Development fixture manifest is empty")
      await mutationClient.execute({
        sql: "delete from files where id = ?",
        args: [deletedFixture.id],
      })
      mutationClient.close()

      await seedDevelopmentDatabase(connection)

      const verificationClient = createClient(connection)
      try {
        const result = await verificationClient.execute({
          sql: "select id from files where id = ?",
          args: [deletedFixture.id],
        })
        expect(result.rows).toHaveLength(0)
      } finally {
        verificationClient.close()
      }
    } finally {
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("produces identical rows in two fresh local databases", async () => {
    const directories = await Promise.all([
      mkdtemp(join(tmpdir(), "enterprise-saas-file-seed-a-")),
      mkdtemp(join(tmpdir(), "enterprise-saas-file-seed-b-")),
    ])

    try {
      const connections = directories.map((directory) => ({
        url: `file:${join(directory, "seed.db")}`,
      }))
      const seedConnection = async (connection: { url: string }) => {
        const client = createClient(connection)
        await migrate(drizzle(client), { migrationsFolder })
        client.close()
        await seedDevelopmentDatabase(connection)
      }
      const firstConnection = connections[0]
      const secondConnection = connections[1]
      if (!firstConnection || !secondConnection) {
        throw new Error("Expected two deterministic seed databases")
      }
      await seedConnection(firstConnection)
      await seedConnection(secondConnection)

      const snapshots = await Promise.all(
        connections.map(readDevelopmentSeedSnapshot)
      )
      expect(snapshots[0]).toEqual(snapshots[1])
    } finally {
      await Promise.all(
        directories.map((directory) =>
          rm(directory, { recursive: true, force: true })
        )
      )
    }
  })

  it("rolls back generated roots when a later anchor insert fails", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "enterprise-saas-file-seed-rollback-")
    )
    const connection = { url: `file:${join(directory, "seed.db")}` }
    const client = createClient(connection)

    try {
      await migrate(drizzle(client), { migrationsFolder })
      await client.execute({
        sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
        args: [
          "preexisting-organization",
          "Preexisting Organization",
          "northstar-seed",
          Date.now(),
        ],
      })
      client.close()

      await expect(seedDevelopmentDatabase(connection)).rejects.toThrow(
        /insert into "organization"/i
      )

      const verificationClient = createClient(connection)
      try {
        const [users, organizations, files] = await Promise.all([
          verificationClient.execute("select id from user"),
          verificationClient.execute("select id from organization order by id"),
          verificationClient.execute("select id from files"),
        ])
        expect(users.rows).toHaveLength(0)
        expect(organizations.rows).toMatchObject([
          { id: "preexisting-organization" },
        ])
        expect(files.rows).toHaveLength(0)
      } finally {
        verificationClient.close()
      }
    } finally {
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
