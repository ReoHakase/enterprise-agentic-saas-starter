import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClient } from "@libsql/client"

export const createTestDatabase = async () => {
  const directory = await mkdtemp(join(tmpdir(), "enterprise-db-test-"))
  const url = `file:${join(directory, "test.db")}`
  const clients: Array<ReturnType<typeof createClient>> = []

  return {
    url,
    connect() {
      const client = createClient({ url })
      clients.push(client)
      return client
    },
    async cleanup() {
      for (const client of clients) {
        client.close()
      }
      await rm(directory, { force: true, recursive: true })
    },
  }
}
