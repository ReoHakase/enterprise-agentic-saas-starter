import { createAgentStorage } from "../src/mastra/storage"

const environment = {
  MASTRA_STORAGE_AUTH_TOKEN: process.env.MASTRA_STORAGE_AUTH_TOKEN,
  MASTRA_STORAGE_URL: process.env.MASTRA_STORAGE_URL,
  NODE_ENV: process.env.NODE_ENV,
}
const threadId = `storage_smoke_${crypto.randomUUID()}`
const resourceId = `resource_smoke_${crypto.randomUUID()}`

const first = createAgentStorage(environment, "storage-smoke-first")
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

console.log("Agent storage smoke passed")
