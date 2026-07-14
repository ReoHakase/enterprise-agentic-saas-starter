import { readFile } from "node:fs/promises"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { RESET_CONFIRMATION, resetLocalDevelopmentDatabase } from "./reset"
import { invitationEmailJobStatuses } from "./schema/app"
import { seedDevelopmentDatabase } from "./seed"

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname

const applyBaselineSchema = async (client: ReturnType<typeof createClient>) => {
  const baseline = await readFile(
    new URL("../drizzle/0000_baseline.sql", import.meta.url),
    "utf8"
  )
  const statements = baseline
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean)
  await client.batch(statements)
}

describe("database migrations", () => {
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
          "audit_logs",
          "invitation_email_jobs",
          "organization_deletion_jobs",
          "rate_limit",
          "todo_comments",
          "todos",
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

  it("preserves legacy todos while converting completed to status", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await applyBaselineSchema(client)

      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["user-1", "Owner", "owner@example.com", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-1", "Org", "org", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["member-1", "org-1", "user-1", "owner", now],
        },
        {
          sql: "insert into todos(id,organization_id,title,completed,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["todo-open", "org-1", "Open", 0, now, now],
        },
        {
          sql: "insert into todos(id,organization_id,title,completed,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["todo-closed", "org-1", "Closed", 1, now + 1, now + 1],
        },
      ])

      await migrate(drizzle(client), { migrationsFolder })

      const todos = await client.execute(
        "select id, number, status, creator_id as creatorId, labels from todos order by number"
      )
      const members = await client.execute(
        "select role from member where id = 'member-1'"
      )
      expect(todos.rows).toMatchObject([
        {
          id: "todo-open",
          number: 1,
          status: "open",
          creatorId: "user-1",
          labels: "[]",
        },
        {
          id: "todo-closed",
          number: 2,
          status: "closed",
          creatorId: "user-1",
          labels: "[]",
        },
      ])
      expect(members.rows).toMatchObject([{ role: "super_admin" }])
    } finally {
      client.close()
    }
  })

  it("repairs legacy membership invariants deterministically and safely replays", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await applyBaselineSchema(client)

      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "dedupe-user",
            "Dedupe User",
            "dedupe@example.com",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["multi-a-user", "Multi A", "multi-a@example.com", 1, now, now],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["multi-z-user", "Multi Z", "multi-z@example.com", 1, now, now],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "zero-admin-user",
            "Zero Admin",
            "zero-admin@example.com",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: [
            "zero-member-user",
            "Zero Member",
            "zero-member@example.com",
            1,
            now,
            now,
          ],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-dedupe", "Dedupe", "dedupe", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-multi", "Multi", "multi", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-zero", "Zero", "zero", now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["org-empty", "Empty", "empty", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["dedupe-a-stable", "org-dedupe", "dedupe-user", "member", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["dedupe-z-admin", "org-dedupe", "dedupe-user", "admin", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "dedupe-super",
            "org-dedupe",
            "dedupe-user",
            "super_admin",
            now + 1,
          ],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "multi-a-canonical",
            "org-multi",
            "multi-a-user",
            "owner",
            now,
          ],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "multi-z-demoted",
            "org-multi",
            "multi-z-user",
            "owner",
            now + 1,
          ],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "zero-a-member",
            "org-zero",
            "zero-member-user",
            "member",
            now,
          ],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "zero-z-admin",
            "org-zero",
            "zero-admin-user",
            "admin",
            now + 1,
          ],
        },
      ])

      const db = drizzle(client)
      await migrate(db, { migrationsFolder })

      const repairedMemberships = await client.execute(
        "select id, organization_id as organizationId, user_id as userId, role from member order by organization_id, id"
      )
      expect(repairedMemberships.rows).toMatchObject([
        {
          id: "dedupe-a-stable",
          organizationId: "org-dedupe",
          userId: "dedupe-user",
          role: "super_admin",
        },
        {
          id: "multi-a-canonical",
          organizationId: "org-multi",
          userId: "multi-a-user",
          role: "super_admin",
        },
        {
          id: "multi-z-demoted",
          organizationId: "org-multi",
          userId: "multi-z-user",
          role: "admin",
        },
        {
          id: "zero-a-member",
          organizationId: "org-zero",
          userId: "zero-member-user",
          role: "member",
        },
        {
          id: "zero-z-admin",
          organizationId: "org-zero",
          userId: "zero-admin-user",
          role: "super_admin",
        },
      ])

      const organizationRoles = await client.execute(
        `select
          organization.id,
          count(member.id) as memberCount,
          sum(case when member.role = 'super_admin' then 1 else 0 end) as superAdminCount
        from organization
        left join member on member.organization_id = organization.id
        group by organization.id
        order by organization.id`
      )
      expect(organizationRoles.rows).toMatchObject([
        { id: "org-dedupe", memberCount: 1, superAdminCount: 1 },
        { id: "org-empty", memberCount: 0, superAdminCount: 0 },
        { id: "org-multi", memberCount: 2, superAdminCount: 1 },
        { id: "org-zero", memberCount: 2, superAdminCount: 1 },
      ])

      await migrate(db, { migrationsFolder })
      const replayedMemberships = await client.execute(
        "select id, organization_id as organizationId, user_id as userId, role from member order by organization_id, id"
      )
      expect(replayedMemberships.rows).toEqual(repairedMemberships.rows)

      await expect(
        client.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "dedupe-duplicate",
            "org-dedupe",
            "dedupe-user",
            "member",
            now + 2,
          ],
        })
      ).rejects.toThrow(/unique/i)
      await expect(
        client.execute(
          "update member set role = 'super_admin' where id = 'multi-z-demoted'"
        )
      ).rejects.toThrow(/unique/i)
    } finally {
      client.close()
    }
  })

  it("expires privileged and invalid pending invitations during migration", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await applyBaselineSchema(client)

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
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: ["inviter-member", "invitation-org", "inviter", "member", now],
        },
        ...(
          [
            ["admin", "admin"],
            ["member", "member"],
            ["owner", "owner"],
            ["super-admin", "super_admin"],
            ["missing", null],
            ["custom", "custom_role"],
          ] as const
        ).map(([id, role]) => ({
          sql: "insert into invitation(id,organization_id,email,role,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?,?)",
          args: [
            `invitation-${id}`,
            "invitation-org",
            `${id}@example.com`,
            role,
            "pending",
            now + 60_000,
            now,
            "inviter",
          ],
        })),
      ])

      await migrate(drizzle(client), { migrationsFolder })

      const invitations = await client.execute(
        "select id, status from invitation order by id"
      )
      expect(invitations.rows).toMatchObject([
        { id: "invitation-admin", status: "pending" },
        { id: "invitation-custom", status: "expired" },
        { id: "invitation-member", status: "pending" },
        { id: "invitation-missing", status: "expired" },
        { id: "invitation-owner", status: "expired" },
        { id: "invitation-super-admin", status: "expired" },
      ])
    } finally {
      client.close()
    }
  })

  it("rejects a comment whose todo belongs to another tenant", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle(client)

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
          sql: "insert into todos(id,organization_id,number,title,creator_id) values(?,?,?,?,?)",
          args: ["todo-a", "org-a", 1, "Tenant A issue", "user-1"],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into todo_comments(id,todo_id,organization_id,author_id,body) values(?,?,?,?,?)",
          args: ["comment-1", "todo-a", "org-b", "user-1", "cross tenant"],
        })
      ).rejects.toThrow(/foreign key/i)
    } finally {
      client.close()
    }
  })

  it("keeps organization deletion jobs durable and idempotent", async () => {
    const client = createClient({ url: "file::memory:" })

    try {
      await migrate(drizzle(client), { migrationsFolder })
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

  it("allows only one pending invitation per tenant and normalized email", async () => {
    const client = createClient({ url: "file::memory:" })
    const db = drizzle(client)

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
            "invitation-1",
            "org-a",
            "member@example.com",
            "pending",
            now + 60_000,
            now,
            "user-1",
          ],
        },
      ])

      await expect(
        client.execute({
          sql: "insert into invitation(id,organization_id,email,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?)",
          args: [
            "invitation-duplicate",
            "org-a",
            "MEMBER@EXAMPLE.COM",
            "pending",
            now + 60_000,
            now,
            "user-1",
          ],
        })
      ).rejects.toThrow(/unique/i)

      await expect(
        client.batch([
          {
            sql: "insert into invitation(id,organization_id,email,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?)",
            args: [
              "invitation-expired",
              "org-a",
              "member@example.com",
              "expired",
              now - 1,
              now,
              "user-1",
            ],
          },
          {
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
          },
        ])
      ).resolves.toBeDefined()
    } finally {
      client.close()
    }
  })

  it("keeps one super admin membership under concurrent insert attempts", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "enterprise-saas-membership-concurrency-")
    )
    const databasePath = join(directory, "membership.db")
    const connection = { url: `file:${databasePath}` }
    const bootstrapClient = createClient(connection)
    const contenderA = createClient(connection)
    const contenderB = createClient(connection)

    try {
      await migrate(drizzle(bootstrapClient), { migrationsFolder })
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
          args: [
            "membership-a",
            "org-concurrent",
            "user-a",
            "super_admin",
            now,
          ],
        }),
        contenderB.execute({
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "membership-b",
            "org-concurrent",
            "user-a",
            "super_admin",
            now,
          ],
        }),
      ])
      expect(
        attempts.filter((attempt) => attempt.status === "fulfilled")
      ).toHaveLength(1)

      const invariant = await bootstrapClient.execute(
        `select
          count(*) as memberCount,
          sum(case when role = 'super_admin' then 1 else 0 end) as superAdminCount
        from member
        where organization_id = 'org-concurrent'`
      )
      expect(invariant.rows).toMatchObject([
        { memberCount: 1, superAdminCount: 1 },
      ])

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
            "membership-second-super-admin",
            "org-concurrent",
            "user-b",
            "super_admin",
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

  it("refuses development seed against a remote Turso database", async () => {
    await expect(
      seedDevelopmentDatabase({
        url: "libsql://production-example.turso.io",
        authToken: "not-used",
      })
    ).rejects.toThrow(/restricted to file: databases and localhost/i)
  })

  it("rebuilds a local file database from migrations before seeding", async () => {
    const directory = await mkdtemp(join(tmpdir(), "enterprise-saas-db-reset-"))
    const databasePath = join(directory, "reset.db")
    const connection = { url: `file:${databasePath}` }
    const client = createClient(connection)

    try {
      await client.execute("create table obsolete_local_table(id text)")
      client.close()

      await resetLocalDevelopmentDatabase(connection, RESET_CONFIRMATION)

      const verificationClient = createClient(connection)
      try {
        const [migrationCount, userCount, todoCount, obsoleteTable] =
          await Promise.all([
            verificationClient.execute(
              "select count(*) as value from __drizzle_migrations"
            ),
            verificationClient.execute("select count(*) as value from user"),
            verificationClient.execute("select count(*) as value from todos"),
            verificationClient.execute(
              "select name from sqlite_master where type = 'table' and name = 'obsolete_local_table'"
            ),
          ])

        expect(Number(migrationCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(Number(userCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(Number(todoCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(obsoleteTable.rows).toHaveLength(0)
      } finally {
        verificationClient.close()
      }
    } finally {
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
