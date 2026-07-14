import { resolve } from "node:path"

import {
  parseOAuthDatabaseUrl,
  removeOAuthDatabaseFiles,
} from "./oauth-database"

const databaseUrl = process.env.TURSO_DATABASE_URL

if (!databaseUrl?.startsWith("file:")) {
  throw new Error("OAuth E2E requires an isolated file: database URL")
}

const databasePath = parseOAuthDatabaseUrl(databaseUrl)
const repositoryRoot = resolve(import.meta.dir, "../../../..")
const databaseWorkspace = resolve(repositoryRoot, "packages/db")
const apiWorkspace = resolve(repositoryRoot, "apps/api")
await removeOAuthDatabaseFiles(databasePath)

try {
  const migration = Bun.spawn(
    ["bun", "--no-env-file", "run", "--cwd", databaseWorkspace, "db:migrate"],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    }
  )

  const migrationExitCode = await migration.exited
  if (migrationExitCode !== 0) {
    throw new Error(`OAuth E2E migration failed with code ${migrationExitCode}`)
  }

  const api = Bun.spawn(["bun", "--no-env-file", "run", "src/index.ts"], {
    cwd: apiWorkspace,
    env: process.env,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })

  const stopApi = () => {
    if (!api.killed) {
      api.kill("SIGTERM")
    }
  }

  process.once("SIGINT", stopApi)
  process.once("SIGTERM", stopApi)

  const apiExitCode = await api.exited
  process.off("SIGINT", stopApi)
  process.off("SIGTERM", stopApi)

  if (apiExitCode !== 0 && apiExitCode !== 143) {
    throw new Error(`OAuth E2E API exited with code ${apiExitCode}`)
  }
} finally {
  await removeOAuthDatabaseFiles(databasePath)
}
