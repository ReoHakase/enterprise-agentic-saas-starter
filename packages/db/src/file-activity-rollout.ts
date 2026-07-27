import { createClient } from "@libsql/client"

export const FILE_STORAGE_SCHEMA_MIGRATION_AT = 1_784_360_549_442
export const FILE_ACTIVITY_BACKFILL_MIGRATION_AT = 1_784_656_583_000
export const AGENT_REFACTOR_PREVIOUS_MIGRATION_AT = 1_784_805_352_094
export const AGENT_REFACTOR_DESTRUCTIVE_MIGRATION_AT = 1_785_183_708_278

export const getCompatibilityDeployReasons = (
  latestMigrationAt: number | null
) => {
  if (latestMigrationAt === null) return []

  const reasons: string[] = []
  if (
    latestMigrationAt >= FILE_STORAGE_SCHEMA_MIGRATION_AT &&
    latestMigrationAt < FILE_ACTIVITY_BACKFILL_MIGRATION_AT
  ) {
    reasons.push("file_activity_backfill")
  }
  if (
    latestMigrationAt >= AGENT_REFACTOR_PREVIOUS_MIGRATION_AT &&
    latestMigrationAt < AGENT_REFACTOR_DESTRUCTIVE_MIGRATION_AT
  ) {
    reasons.push("agent_refactor_destructive")
  }
  return reasons
}

export const needsCompatibilityDeploy = (latestMigrationAt: number | null) =>
  getCompatibilityDeployReasons(latestMigrationAt).length > 0

export const needsFileActivityCompatibilityDeploy = (
  latestMigrationAt: number | null
) =>
  getCompatibilityDeployReasons(latestMigrationAt).includes(
    "file_activity_backfill"
  )

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
  const reasons = getCompatibilityDeployReasons(latestMigrationAt)
  process.stdout.write(
    `compatibility_deploy=${reasons.length > 0}\ncompatibility_reason=${reasons.join(",")}\n`
  )
}
