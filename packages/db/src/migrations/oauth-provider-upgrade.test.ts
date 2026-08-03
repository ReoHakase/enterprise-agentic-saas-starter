import { rm } from "node:fs/promises"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { describe, expect, it } from "vitest"

import { createMigrationPrefix, migrationsFolder } from "./helpers"

describe("database migrations: OAuth provider upgrade", () => {
  it("adds OAuth provider tables without changing existing auth rows", async () => {
    const client = createClient({ url: "file::memory:" })
    const migrationPrefix = await createMigrationPrefix({
      through: "0028_chubby_blackheart",
    })

    try {
      await migrate(drizzle(client), { migrationsFolder: migrationPrefix })
      const now = Date.now()
      await client.execute({
        sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
        args: [
          "oauth-upgrade-user",
          "OAuth User",
          "oauth@example.test",
          1,
          now,
          now,
        ],
      })

      await migrate(drizzle(client), { migrationsFolder })

      const user = await client.execute({
        sql: "select id,email from user where id = ?",
        args: ["oauth-upgrade-user"],
      })
      expect(user.rows).toEqual([
        { id: "oauth-upgrade-user", email: "oauth@example.test" },
      ])
      const oauthTables = await client.execute(
        "select name from sqlite_master where type = 'table' and name like 'oauth_%' order by name"
      )
      expect(oauthTables.rows.map(({ name }) => name)).toEqual([
        "oauth_access_token",
        "oauth_client",
        "oauth_consent",
        "oauth_refresh_token",
      ])
      expect((await client.execute("pragma foreign_key_check")).rows).toEqual(
        []
      )
    } finally {
      client.close()
      await rm(migrationPrefix, { recursive: true, force: true })
    }
  })
})
