import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { createClient } from "@libsql/client"

type MigrationJournal = {
  entries: Array<{
    idx: number
    tag: string
  }>
}

export const migrationsFolder = new URL("../../drizzle", import.meta.url)
  .pathname

/**
 * Creates an append-only migration prefix ending at a semantic journal tag.
 * Tests must not depend on a mutable array index when selecting legacy state.
 */
export const createMigrationPrefix = async ({
  through,
}: {
  through: string
}) => {
  const journal: MigrationJournal = JSON.parse(
    await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8")
  )
  const cutoff = journal.entries.findIndex(({ tag }) => tag === through)
  if (cutoff < 0) {
    throw new Error(`Migration tag "${through}" does not exist in the journal.`)
  }

  const directory = await mkdtemp(join(tmpdir(), "db-migrations-prefix-"))
  const metaDirectory = join(directory, "meta")
  await mkdir(metaDirectory)
  const entries = journal.entries.slice(0, cutoff + 1)
  await Promise.all(
    entries.map(({ tag }) =>
      copyFile(
        join(migrationsFolder, `${tag}.sql`),
        join(directory, `${tag}.sql`)
      )
    )
  )
  await writeFile(
    join(metaDirectory, "_journal.json"),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`
  )
  return directory
}

export const applyBaselineSchema = async (
  client: ReturnType<typeof createClient>
) => {
  const baseline = await readFile(
    new URL("../../drizzle/0000_baseline.sql", import.meta.url),
    "utf8"
  )
  const statements = baseline
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean)
  await client.batch(statements)
}
