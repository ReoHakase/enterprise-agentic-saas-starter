import { cp, mkdtemp, readdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { createClient } from "@libsql/client"

export const migrationsFolder = new URL("../../drizzle-v3", import.meta.url)
  .pathname

const readMigrationDirectories = async () =>
  (
    await readdir(migrationsFolder, {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)
    .sort()

const findMigrationDirectory = async (marker: string) => {
  const semanticName = marker.replace(/^\d{4}_/, "")
  const matches = (await readMigrationDirectories()).filter(
    (directory) =>
      directory === marker || directory.endsWith(`_${semanticName}`)
  )
  const match = matches.at(0)
  if (matches.length !== 1 || !match) {
    throw new Error(
      `Migration marker "${marker}" matched ${matches.length} v3 directories.`
    )
  }
  return match
}

/**
 * Creates a migration prefix ending at a semantic directory marker.
 * Tests must not depend on a mutable array index when selecting historical state.
 */
export const createMigrationPrefix = async ({
  through,
}: {
  through: string
}) => {
  const migrations = await readMigrationDirectories()
  const throughDirectory = await findMigrationDirectory(through)
  const cutoff = migrations.indexOf(throughDirectory)
  const directory = await mkdtemp(join(tmpdir(), "db-migrations-prefix-"))
  await Promise.all(
    migrations.slice(0, cutoff + 1).map((migration) =>
      cp(join(migrationsFolder, migration), join(directory, migration), {
        recursive: true,
      })
    )
  )
  return directory
}

export const applyBaselineSchema = async (
  client: ReturnType<typeof createClient>
) => {
  const baselineDirectory = await findMigrationDirectory("baseline")
  const baseline = await readFile(
    join(migrationsFolder, baselineDirectory, "migration.sql"),
    "utf8"
  )
  const statements = baseline
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean)
  await client.batch(statements)
}
