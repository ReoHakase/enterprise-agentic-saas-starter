import { execFile } from "node:child_process"
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const committedDirectory = join(packageDirectory, "drizzle")
const drizzleKitEntrypoint = join(
  packageDirectory,
  "node_modules/drizzle-kit/bin.cjs"
)
const executeFile = promisify(execFile)

const snapshotDirectory = async (directory: string) => {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })
  const files = entries.filter((entry) => entry.isFile())
  const snapshots = await Promise.all(
    files.map(async (entry) => {
      const path = join(entry.parentPath, entry.name)
      return [relative(directory, path), await readFile(path)] as const
    })
  )
  return new Map(snapshots)
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "db-schema-drift-"))
const generatedDirectory = join(temporaryRoot, "drizzle")

try {
  await cp(committedDirectory, generatedDirectory, { recursive: true })
  const before = await snapshotDirectory(generatedDirectory)
  const { stdout } = await executeFile(
    "node",
    [
      drizzleKitEntrypoint,
      "generate",
      "--schema",
      "./src/schema/index.ts",
      "--dialect",
      "turso",
      "--out",
      generatedDirectory,
    ],
    {
      cwd: packageDirectory,
      encoding: "utf8",
    }
  )

  const after = await snapshotDirectory(generatedDirectory)
  const changed =
    before.size !== after.size ||
    [...before].some(([path, contents]) => !after.get(path)?.equals(contents))
  if (changed) {
    throw new Error(
      `Drizzle schema drift detected. Generate and commit a new migration.\n${stdout.trim()}`
    )
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
