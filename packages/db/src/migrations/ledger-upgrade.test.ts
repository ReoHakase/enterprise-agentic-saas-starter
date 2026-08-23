import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { describe, expect, it } from "vitest"

import { createMigrationPrefix, migrationsFolder } from "./helpers"

describe("database migrations: ledger upgrade", () => {
  it("upgrades a v0 ledger without changing old identities or replaying their DDL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "db-ledger-upgrade-"))
    const client = createClient({
      url: `file:${join(directory, "database.db")}`,
    })
    const migrationPrefix = await createMigrationPrefix({
      through: "0030_same_black_knight",
    })

    try {
      await migrate(drizzle({ client }), { migrationsFolder: migrationPrefix })
      await client.execute({
        sql: "insert into user(id,name,email,email_verified,created_at,updated_at) values(?,?,?,?,?,?)",
        args: [
          "ledger-upgrade-user",
          "Ledger Upgrade User",
          "ledger-upgrade@example.test",
          1,
          1,
          1,
        ],
      })

      const migrationNamesByHash = new Map(
        readMigrationFiles({ migrationsFolder: migrationPrefix }).map(
          ({ hash, name }) => [hash, name]
        )
      )
      await client.batch([
        "create table __drizzle_migrations_v0 (id integer primary key, hash text not null, created_at numeric)",
        "insert into __drizzle_migrations_v0(id,hash,created_at) select id,hash,cast(created_at as integer) + 321 from __drizzle_migrations order by id",
        "drop table __drizzle_migrations",
        "alter table __drizzle_migrations_v0 rename to __drizzle_migrations",
      ])
      const legacyRows = await client.execute(
        "select id,hash,created_at from __drizzle_migrations order by id"
      )

      await migrate(drizzle({ client }), { migrationsFolder })

      const upgradedRows = await client.execute(
        "select id,hash,created_at,name,applied_at from __drizzle_migrations order by id"
      )
      const upgradedLegacyRows = upgradedRows.rows.slice(
        0,
        legacyRows.rows.length
      )
      expect(upgradedLegacyRows).toEqual(
        legacyRows.rows.map(({ id, hash, created_at: createdAt }) => {
          const name = migrationNamesByHash.get(String(hash))
          if (!name) throw new Error(`Missing local migration for hash ${hash}`)
          return {
            id,
            hash,
            created_at: createdAt,
            name,
            applied_at: null,
          }
        })
      )
      expect(upgradedRows.rows.length).toBeGreaterThan(legacyRows.rows.length)
      expect(
        (
          await client.execute({
            sql: "select id,email from user where id = ?",
            args: ["ledger-upgrade-user"],
          })
        ).rows
      ).toEqual([
        {
          id: "ledger-upgrade-user",
          email: "ledger-upgrade@example.test",
        },
      ])
    } finally {
      client.close()
      await Promise.all(
        [directory, migrationPrefix].map((path) =>
          rm(path, { recursive: true, force: true })
        )
      )
    }
  })
})
