import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

type MigrationJournal = {
  dialect: string
  entries: unknown[]
  version: string
}

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const migrationPath = "packages/db/drizzle"
const journalPath = `${migrationPath}/meta/_journal.json`

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

const changedHistory = runGit([
  "diff",
  "--name-status",
  "--no-renames",
  "origin/main",
  "--",
  migrationPath,
])
  .trim()
  .split("\n")
  .filter(Boolean)

const forbiddenChanges = changedHistory.filter((line) => {
  const [status, path] = line.split("\t")
  if (path === journalPath && status === "M") return false
  return status !== "A"
})

if (forbiddenChanges.length > 0) {
  throw new Error(
    `Migration history on origin/main is immutable:\n${forbiddenChanges.join("\n")}`
  )
}

const journalChange = changedHistory.find((line) =>
  line.endsWith(`\t${journalPath}`)
)
if (journalChange) {
  const baseline: MigrationJournal = JSON.parse(
    runGit(["show", `origin/main:${journalPath}`])
  )
  const current: MigrationJournal = JSON.parse(
    await readFile(join(repositoryDirectory, journalPath), "utf8")
  )
  const currentPrefix = current.entries.slice(0, baseline.entries.length)
  if (
    current.version !== baseline.version ||
    current.dialect !== baseline.dialect ||
    current.entries.length < baseline.entries.length ||
    JSON.stringify(currentPrefix) !== JSON.stringify(baseline.entries)
  ) {
    throw new Error(
      "Migration journal may only append entries after the origin/main prefix."
    )
  }
}
