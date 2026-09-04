import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClient } from "@libsql/client"
import { describe, expect, it } from "vitest"

import {
  RESET_CONFIRMATION,
  resetLocalDevelopmentDatabase,
} from "../development/reset"
import { seedDevelopmentDatabase } from "../development/seed"

describe("DBマイグレーションのlifecycle", () => {
  it("remote Turso DBへの開発seedを拒否する", async () => {
    await expect(
      seedDevelopmentDatabase({
        url: "libsql://production-example.turso.io",
        authToken: "not-used",
      })
    ).rejects.toThrow(/restricted to file: databases and localhost/i)
    await expect(
      seedDevelopmentDatabase({
        url: "file://storage.example.com/shared.db",
      })
    ).rejects.toThrow(/restricted to file: databases and localhost/i)
  })

  it("local URLでもproductionの開発seedとresetを拒否する", async () => {
    const previousNodeEnvironment = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      await expect(
        seedDevelopmentDatabase({ url: "file::memory:" })
      ).rejects.toThrow(/seed is disabled in production/i)
      await expect(
        resetLocalDevelopmentDatabase(
          { url: "file::memory:" },
          RESET_CONFIRMATION
        )
      ).rejects.toThrow(/reset is disabled in production/i)
    } finally {
      if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnvironment
    }
  })

  it("seed前にマイグレーションからlocal file DBを再構築する", async () => {
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
        const [
          migrationCount,
          userCount,
          issueCount,
          fileCount,
          fileOwnerCount,
          usage,
          obsoleteTable,
        ] = await Promise.all([
          verificationClient.execute(
            "select count(*) as value from __drizzle_migrations"
          ),
          verificationClient.execute("select count(*) as value from user"),
          verificationClient.execute("select count(*) as value from issues"),
          verificationClient.execute(
            "select count(*) as value from files where status = 'pending'"
          ),
          verificationClient.execute(
            "select count(*) as value from issue_file_owners"
          ),
          verificationClient.execute(
            "select organization_id as organizationId, used_bytes as usedBytes from organization_file_usage where used_bytes > 0 order by organization_id"
          ),
          verificationClient.execute(
            "select name from sqlite_master where type = 'table' and name = 'obsolete_local_table'"
          ),
        ])

        expect(Number(migrationCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(Number(userCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(Number(issueCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(Number(fileCount.rows[0]?.value)).toBeGreaterThan(0)
        expect(fileOwnerCount.rows).toEqual(fileCount.rows)
        expect(usage.rows).toHaveLength(2)
        expect(usage.rows.every(({ usedBytes }) => Number(usedBytes) > 0)).toBe(
          true
        )
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
