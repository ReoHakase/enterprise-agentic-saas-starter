import { createClient } from "@libsql/client"

export const FILE_STORAGE_SCHEMA_MIGRATION_AT = 1_784_360_549_442
export const FILE_ACTIVITY_BACKFILL_MIGRATION_AT = 1_784_656_583_000
export const AGENT_CONTROL_PLANE_MIGRATION_AT = 1_784_676_660_379
export const AGENT_REFACTOR_DESTRUCTIVE_MIGRATION_AT = 1_785_183_708_278

export const getCompatibilityDeployReasons = (
  latestMigrationAt: number | null,
  agentSchemaTables: readonly string[] = []
) => {
  const reasons: string[] = []
  if (
    latestMigrationAt !== null &&
    latestMigrationAt >= FILE_STORAGE_SCHEMA_MIGRATION_AT &&
    latestMigrationAt < FILE_ACTIVITY_BACKFILL_MIGRATION_AT
  ) {
    reasons.push("file_activity_backfill")
  }
  if (
    (latestMigrationAt !== null &&
      latestMigrationAt >= AGENT_CONTROL_PLANE_MIGRATION_AT &&
      latestMigrationAt < AGENT_REFACTOR_DESTRUCTIVE_MIGRATION_AT) ||
    ((latestMigrationAt === null ||
      latestMigrationAt < AGENT_CONTROL_PLANE_MIGRATION_AT) &&
      agentSchemaTables.length > 0)
  ) {
    reasons.push("agent_refactor_destructive")
  }
  return reasons
}

export const needsCompatibilityDeploy = (
  latestMigrationAt: number | null,
  agentSchemaTables: readonly string[] = []
) =>
  getCompatibilityDeployReasons(latestMigrationAt, agentSchemaTables).length > 0

export const needsFileActivityCompatibilityDeploy = (
  latestMigrationAt: number | null
) =>
  getCompatibilityDeployReasons(latestMigrationAt).includes(
    "file_activity_backfill"
  )

const getRolloutState = async () => {
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
    let latestMigrationAt: number | null = null
    if (ledger.rows[0]) {
      const result = await client.execute(
        'select max(created_at) as "createdAt" from __drizzle_migrations'
      )
      const value = result.rows[0]?.createdAt
      if (value !== null && value !== undefined && typeof value !== "number") {
        throw new Error("Turso migration ledger timestamp is invalid")
      }
      latestMigrationAt = value ?? null
    }

    const agentSchema = await client.execute(
      "select name from sqlite_master where type = 'table' and name like 'agent_%' order by name"
    )
    const agentSchemaTables = agentSchema.rows.map(({ name }) => {
      if (typeof name !== "string") {
        throw new Error("Turso Agent schema inventory is invalid")
      }
      return name
    })
    return { agentSchemaTables, latestMigrationAt }
  } finally {
    client.close()
  }
}

if (import.meta.main) {
  const { agentSchemaTables, latestMigrationAt } = await getRolloutState()
  const reasons = getCompatibilityDeployReasons(
    latestMigrationAt,
    agentSchemaTables
  )
  process.stdout.write(
    `compatibility_deploy=${reasons.length > 0}\ncompatibility_reason=${reasons.join(",")}\n`
  )
}
