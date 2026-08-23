import { spawnSync } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const legacyPath = "packages/db/drizzle"
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

const legacyFiles = [
  ...lines(runGit(["ls-files", "--", legacyPath])),
  ...untrackedFor(legacyPath),
]
if (legacyFiles.length > 0) {
  throw new Error(
    `The removed legacy migration directory must stay absent:\n${legacyFiles.join("\n")}`
  )
}

const committedFiles = new Set(
  lines(runGit(["ls-tree", "-r", "--name-only", "origin/main", "--", v3Path]))
)
const committedDirectories = new Set(
  [...committedFiles].map((path) => dirname(path))
)
const changedV3 = new Map<string, string>()
for (const line of diffFor(v3Path)) {
  const [status, path] = line.split("\t")
  if (status && path) changedV3.set(path, status)
}
for (const path of untrackedFor(v3Path)) changedV3.set(path, "A")

const forbiddenV3Changes = [...changedV3].filter(([path, status]) => {
  if (status !== "A") return true
  return committedDirectories.has(dirname(path))
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
if (
  committedDirectories.size === 0 &&
  (migrationDirectories.length !== 1 ||
    !migrationDirectories[0]?.endsWith("_baseline"))
) {
  throw new Error(
    "The one-time v3 history reset must contain exactly one baseline directory."
  )
}
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

await Promise.all(
  migrationDirectories.map(async (directory) => {
    const snapshot = await readFile(
      join(v3Directory, directory, "snapshot.json"),
      "utf8"
    )
    JSON.parse(snapshot)
  })
)
