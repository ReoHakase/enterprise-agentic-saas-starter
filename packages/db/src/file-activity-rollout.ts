import { createClient } from "@libsql/client"

export const FILE_STORAGE_SCHEMA_MIGRATION_AT = 1_784_360_549_442
export const FILE_ACTIVITY_BACKFILL_MIGRATION_AT = 1_784_656_583_000

export const needsFileActivityCompatibilityDeploy = (
  latestMigrationAt: number | null
) =>
  latestMigrationAt !== null &&
  latestMigrationAt >= FILE_STORAGE_SCHEMA_MIGRATION_AT &&
  latestMigrationAt < FILE_ACTIVITY_BACKFILL_MIGRATION_AT

const getLatestMigrationAt = async () => {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken) {
    throw new Error("Turso rollout inspection requires database credentials")
  }

  const client = createClient({ url, authToken })
  try {
    const ledger = await client.execute(
      "select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations' limit 1"
    )
    if (!ledger.rows[0]) return null

    const result = await client.execute(
      'select max(created_at) as "createdAt" from __drizzle_migrations'
    )
    const value = result.rows[0]?.createdAt
    return typeof value === "number" ? value : null
  } finally {
    client.close()
  }
}

if (import.meta.main) {
  const latestMigrationAt = await getLatestMigrationAt()
  process.stdout.write(
    `compatibility_deploy=${needsFileActivityCompatibilityDeploy(latestMigrationAt)}\n`
  )
}
