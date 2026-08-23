import { spawnSync } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

type MigrationJournal = {
  entries: Array<{
    tag: string
    when: number
  }>
}

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const archivePath = "packages/db/drizzle"
const v3Path = "packages/db/drizzle-v3"
const requiredFiles = ["migration.sql", "snapshot.json"]

const runGit = (arguments_: string[]) => {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryDirectory,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`
    )
  }
  return result.stdout
}

const lines = (output: string) => output.trim().split("\n").filter(Boolean)
const diffFor = (path: string) =>
  lines(
    runGit(["diff", "--name-status", "--no-renames", "origin/main", "--", path])
  )
const untrackedFor = (path: string) =>
  lines(runGit(["ls-files", "--others", "--exclude-standard", "--", path]))

const archiveChanges = [
  ...diffFor(archivePath),
  ...untrackedFor(archivePath).map((path) => `A\t${path}`),
]
if (archiveChanges.length > 0) {
  throw new Error(
    `The legacy migration archive must match origin/main byte-for-byte:\n${archiveChanges.join("\n")}`
  )
}

const baselineFiles = new Set(
  lines(runGit(["ls-tree", "-r", "--name-only", "origin/main", "--", v3Path]))
)
const baselineDirectories = new Set(
  [...baselineFiles].map((path) => dirname(path))
)
const changedV3 = new Map<string, string>()
for (const line of diffFor(v3Path)) {
  const [status, path] = line.split("\t")
  if (status && path) changedV3.set(path, status)
}
for (const path of untrackedFor(v3Path)) changedV3.set(path, "A")

const forbiddenV3Changes = [...changedV3].filter(([path, status]) => {
  if (status !== "A") return true
  return baselineDirectories.has(dirname(path))
})
if (forbiddenV3Changes.length > 0) {
  throw new Error(
    `Existing v3 migration directories are immutable:\n${forbiddenV3Changes
      .map(([path, status]) => `${status}\t${path}`)
      .join("\n")}`
  )
}

const v3Directory = join(repositoryDirectory, v3Path)
const migrationDirectories = (
  await readdir(v3Directory, { withFileTypes: true })
)
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => name)
  .toSorted()
for (const directory of migrationDirectories) {
  if (!/^\d{14}_[a-z0-9_]+$/.test(directory)) {
    throw new Error(`Invalid v3 migration directory name: ${directory}`)
  }
}

const newDirectories = new Set(
  [...changedV3.keys()].map((path) =>
    relative(v3Path, dirname(path)).replaceAll("\\", "/")
  )
)
await Promise.all(
  [...newDirectories].map(async (directory) => {
    const files = (
      await readdir(join(v3Directory, directory), { withFileTypes: true })
    )
      .filter((entry) => entry.isFile())
      .map(({ name }) => name)
      .toSorted()
    if (JSON.stringify(files) !== JSON.stringify(requiredFiles)) {
      throw new Error(
        `New v3 migration directory ${directory} must contain only ${requiredFiles.join(", ")}.`
      )
    }
  })
)

const formatTimestamp = (milliseconds: number) => {
  const date = new Date(milliseconds)
  const components = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ]
  return components
    .map((component, index) =>
      index === 0 ? String(component) : String(component).padStart(2, "0")
    )
    .join("")
}

const journal: MigrationJournal = JSON.parse(
  await readFile(
    join(repositoryDirectory, archivePath, "meta/_journal.json"),
    "utf8"
  )
)
await Promise.all(
  journal.entries.map(async ({ tag, when }) => {
    const directory = `${formatTimestamp(when)}_${tag.replace(/^\d{4}_/, "")}`
    if (!migrationDirectories.includes(directory)) {
      throw new Error(`Converted v3 migration is missing: ${directory}`)
    }
    const [legacySql, convertedSql, snapshot] = await Promise.all([
      readFile(join(repositoryDirectory, archivePath, `${tag}.sql`)),
      readFile(join(v3Directory, directory, "migration.sql")),
      readFile(join(v3Directory, directory, "snapshot.json"), "utf8"),
    ])
    if (!legacySql.equals(convertedSql)) {
      throw new Error(
        `Converted SQL differs from the legacy archive: ${directory}`
      )
    }
    JSON.parse(snapshot)
  })
)
