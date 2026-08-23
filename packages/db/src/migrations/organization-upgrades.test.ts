import { rm } from "node:fs/promises"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { createMigrationPrefix, migrationsFolder } from "./helpers"

describe("database migrations: organization upgrades", () => {
  it("converts the owner before replacing its index and removes only the invitation outbox", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0026_agent_luna_pricing",
    })

    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.batch([
        {
          sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
          args: ["owner-user", "Owner", "owner@example.test", 1, now, now],
        },
        {
          sql: "insert into organization(id,name,slug,created_at) values(?,?,?,?)",
          args: ["owner-org", "Owner Org", "owner-org", now],
        },
        {
          sql: "insert into member(id,organization_id,user_id,role,created_at) values(?,?,?,?,?)",
          args: [
            "owner-membership",
            "owner-org",
            "owner-user",
            "super_admin",
            now,
          ],
        },
        {
          sql: "insert into invitation(id,organization_id,email,role,status,expires_at,created_at,inviter_id) values(?,?,?,?,?,?,?,?)",
          args: [
            "owner-invitation",
            "owner-org",
            "member@example.test",
            "member",
            "pending",
            now + 60_000,
            now,
            "owner-user",
          ],
        },
        {
          sql: "insert into invitation_email_jobs(id,invitation_id) values(?,?)",
          args: ["legacy-email-job", "owner-invitation"],
        },
      ])

      await migrate(drizzle({ client }), { migrationsFolder })

      const [membership, invitation, tables, indexes] = await Promise.all([
        client.execute("select role from member where id = 'owner-membership'"),
        client.execute(
          "select status from invitation where id = 'owner-invitation'"
        ),
        client.execute(
          "select name from sqlite_master where type = 'table' order by name"
        ),
        client.execute(
          "select name from sqlite_master where type = 'index' and tbl_name = 'member' order by name"
        ),
      ])

      expect(membership.rows).toMatchObject([{ role: "owner" }])
      expect(invitation.rows).toMatchObject([{ status: "pending" }])
      expect(tables.rows.map(({ name }) => name)).not.toContain(
        "invitation_email_jobs"
      )
      expect(indexes.rows.map(({ name }) => name)).toContain(
        "member_organization_owner_uidx"
      )
      expect(indexes.rows.map(({ name }) => name)).not.toContain(
        "member_organization_super_admin_uidx"
      )
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })
})
