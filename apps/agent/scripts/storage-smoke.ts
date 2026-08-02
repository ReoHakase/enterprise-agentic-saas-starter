import { createAgentStorage } from "../src/mastra/storage"

const environment = {
  MASTRA_STORAGE_AUTH_TOKEN: process.env.MASTRA_STORAGE_AUTH_TOKEN,
  MASTRA_STORAGE_URL: process.env.MASTRA_STORAGE_URL,
  NODE_ENV: process.env.NODE_ENV,
}
const storageUrl = environment.MASTRA_STORAGE_URL?.trim()
if (!storageUrl) throw new Error("MASTRA_STORAGE_URL is required")
const storageOrigin = new URL(storageUrl)
if (storageOrigin.protocol !== "http:" && storageOrigin.protocol !== "https:") {
  throw new Error("Agent storage smoke requires the local Turso HTTP transport")
}
if (
  storageOrigin.hostname !== "127.0.0.1" &&
  storageOrigin.hostname !== "localhost" &&
  !storageOrigin.hostname.endsWith(".localhost")
) {
  throw new Error("Agent storage smoke requires a localhost origin")
}
const threadId = `storage_smoke_${crypto.randomUUID()}`
const resourceId = `resource_smoke_${crypto.randomUUID()}`

const first = createAgentStorage(environment, "storage-smoke-first")
await Promise.all([first.init(), first.init(), first.init()])
await first.init()
const firstMemory = await first.getStore("memory")
if (!firstMemory) throw new Error("Agent storage smoke failed")
await firstMemory.saveThread({
  thread: {
    id: threadId,
    resourceId,
    createdAt: new Date(),
    updatedAt: new Date(),
    title: "Storage smoke",
    metadata: { smoke: true },
  },
})
await first.close()

const reopened = createAgentStorage(environment, "storage-smoke-reopened")
try {
  await reopened.init()
  const reopenedMemory = await reopened.getStore("memory")
  if (!reopenedMemory) throw new Error("Agent storage smoke failed")
  const thread = await reopenedMemory.getThreadById({ threadId })
  if (thread?.resourceId !== resourceId || thread.title !== "Storage smoke") {
    throw new Error("Agent storage smoke failed")
  }
  await reopenedMemory.deleteThread({ threadId })
} finally {
  await reopened.close()
}

console.log("STANDARD_LIBSQL_INIT_OK")
console.log("Agent storage smoke passed")
