import { rm } from "node:fs/promises"
import { join } from "node:path"

const localDatabasePath = join(
  import.meta.dir,
  "..",
  ".local",
  "mastra",
  "dev.db"
)
const configuredUrl = process.env.MASTRA_STORAGE_URL?.trim()
const isLocalDevelopmentUrl =
  configuredUrl === undefined ||
  configuredUrl === "https://agent-storage.enterprise-agentic-saas.localhost" ||
  configuredUrl === `file:${localDatabasePath}`

if (process.env.NODE_ENV === "production" || !isLocalDevelopmentUrl) {
  throw new Error("Agent storage reset is unavailable")
}

await Promise.all(
  [
    localDatabasePath,
    `${localDatabasePath}-shm`,
    `${localDatabasePath}-wal`,
  ].map((path) => rm(path, { force: true }))
)

console.log("Local Agent storage reset")
