import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { migrationsFolder } from "./helpers"

describe("database migrations: invariants", () => {
  it("rejects a comment whose issue belongs to another tenant", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle({ client })

    try {
      await migrate(db, { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-1", "Owner", "owner@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-a", "Org A", "org-a", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-b", "Org B", "org-b", now],
        },
        {
          sql: "insert into issues(id,organization_id,number,title,creator_id) values(?,?,?,?,?)",
          args: ["issue-a", "org-a", 1, "Tenant A issue", "user-1"],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into issue_comments(id,issue_id,organization_id,author_id,body) values(?,?,?,?,?)",
          args: ["comment-1", "issue-a", "org-b", "user-1", "cross tenant"],
        })
      ).rejects.toThrow(/foreign key/i)
    } finally {
      client.close()
    }
  })

  it("rejects an activity event whose issue belongs to another tenant", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle({ client })

    try {
      await migrate(db, { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-1", "Owner", "owner@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-a", "Org A", "org-a", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-b", "Org B", "org-b", now],
        },
        {
          sql: "insert into issues(id,organization_id,number,title,creator_id) values(?,?,?,?,?)",
          args: ["issue-a", "org-a", 1, "Tenant A issue", "user-1"],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into issue_activity_events(id,organization_id,issue_id,actor_user_id,batch_id,kind) values(?,?,?,?,?,?)",
          args: [
            "activity-1",
            "org-b",
            "issue-a",
            "user-1",
            "batch-1",
            "created",
          ],
        })
      ).rejects.toThrow(/foreign key/i)
    } finally {
      client.close()
    }
  })

  it("keeps organization deletion jobs durable and idempotent", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle({ client }), { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["actor-1", "Actor", "actor@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-delete", "Delete Me", "delete-me", now],
        },
        {
          sql: "insert into organization_deletion_jobs(id,organization_id,requested_by_user_id,idempotency_key,status) values(?,?,?,?,?)",
          args: [
            "deletion-job-1",
            "org-delete",
            "actor-1",
            "delete-org-delete",
            "pending",
          ],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into organization_deletion_jobs(id,organization_id,requested_by_user_id,idempotency_key,status) values(?,?,?,?,?)",
          args: [
            "deletion-job-invalid-status",
            "org-delete",
            "actor-1",
            "invalid-status",
            "cancelled",
          ],
        })
      ).rejects.toThrow(/check constraint/i)

      await expect(
        client.execute({
          sql: "insert into organization_deletion_jobs(id,organization_id,requested_by_user_id,idempotency_key,status) values(?,?,?,?,?)",
          args: [
            "deletion-job-duplicate",
            "org-delete",
            "actor-1",
            "delete-org-delete",
            "pending",
          ],
        })
      ).rejects.toThrow(/unique/i)

      await client.execute("delete from organization where id = 'org-delete'")
      const jobs = await client.execute(
        "select id, organization_id as organizationId, requested_by_user_id as requestedByUserId, idempotency_key as idempotencyKey, status from organization_deletion_jobs"
      )
      expect(jobs.rows).toMatchObject([
        {
          id: "deletion-job-1",
          organizationId: "org-delete",
          requestedByUserId: "actor-1",
          idempotencyKey: "delete-org-delete",
          status: "pending",
        },
      ])
    } finally {
      client.close()
    }
  })

  it("allows expired pending history alongside a new active invitation", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle({ client })

    try {
      await migrate(db, { migrationsFolder })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-1", "Owner", "owner@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-a", "Org A", "org-a", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-b", "Org B", "org-b", now],
        },
        {
          sql: "insert into invitation(id,organization_id,email,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?)",
          args: [
            "invitation-expired-by-time",
            "org-a",
            "member@example.com",
            "pending",
            now - 1,
            now,
            "user-1",
          ],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into invitation(id,organization_id,email,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?)",
          args: [
            "invitation-active",
            "org-a",
            "MEMBER@EXAMPLE.COM",
            "pending",
            now + 60_000,
            now,
            "user-1",
          ],
        })
      ).resolves.toBeDefined()

      await expect(
        client.execute({
          sql: "insert into invitation(id,organization_id,email,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?)",
          args: [
            "invitation-other-tenant",
            "org-b",
            "member@example.com",
            "pending",
            now + 60_000,
            now,
            "user-1",
          ],
        })
      ).resolves.toBeDefined()

      const invitations = await client.execute(
        "select id, status from invitation where organization_id = 'org-a' order by id"
      )
      expect(invitations.rows).toMatchObject([
        { id: "invitation-active", status: "pending" },
        { id: "invitation-expired-by-time", status: "pending" },
      ])
      const indexes = await client.execute("pragma index_list('invitation')")
      expect(indexes.rows.map((row) => row.name)).not.toContain(
        "invitation_pending_organization_email_uidx"
      )
    } finally {
      client.close()
    }
  })

  it("keeps one owner membership under concurrent insert attempts", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "enterprise-saas-membership-concurrency-")
    )
    const databasePath = join(directory, "membership.db")
    const connection = { url: `file:${databasePath}` }
    const bootstrapClient = createClient(connection)
    const contenderA = createClient(connection)
    const contenderB = createClient(connection)

    try {
      await migrate(drizzle({ client: bootstrapClient }), { migrationsFolder })
      const now = Date.now()
      await bootstrapClient.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-a", "User A", "user-a@example.com", 1, now, now],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-b", "User B", "user-b@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-concurrent", "Concurrent", "concurrent", now],
        },
      ])

      const attempts = await Promise.allSettled([
        contenderA.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["membership-a", "org-concurrent", "user-a", "owner", now],
        }),
        contenderB.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["membership-b", "org-concurrent", "user-a", "owner", now],
        }),
      ])
      expect(
        attempts.filter((attempt) => attempt.status === "fulfilled")
      ).toHaveLength(1)

      const invariant = await bootstrapClient.execute(
        `select
          count(*) as memberCount,
          sum(case when role = 'owner' then 1 else 0 end) as ownerCount
        from member
        where organization_id = 'org-concurrent'`
      )
      expect(invariant.rows).toMatchObject([{ memberCount: 1, ownerCount: 1 }])

      await expect(
        bootstrapClient.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "membership-duplicate-user",
            "org-concurrent",
            "user-a",
            "member",
            now + 1,
          ],
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        bootstrapClient.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "membership-second-owner",
            "org-concurrent",
            "user-b",
            "owner",
            now + 1,
          ],
        })
      ).rejects.toThrow(/unique/i)
    } finally {
      bootstrapClient.close()
      contenderA.close()
      contenderB.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
