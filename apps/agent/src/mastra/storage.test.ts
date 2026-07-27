import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Agent } from "@mastra/core/agent"
import { Memory } from "@mastra/memory"
import { describe, expect, it } from "vitest"

import { createCurrentMessageImageContext } from "./core/messages/chat-input"
import { createAgentStorage } from "./storage"
import { createScriptedModel } from "./test-support/scripted-model"

describe("Agent storage configuration", () => {
  it("fails closed when production storage is absent", () => {
    expect(() => createAgentStorage({ NODE_ENV: "production" })).toThrow(
      "Agent storage configuration is unavailable"
    )
  })

  it("requires a remote authenticated production database", () => {
    expect(() =>
      createAgentStorage({
        MASTRA_STORAGE_AUTH_TOKEN: "agent-token",
        MASTRA_STORAGE_URL: "file:agent.db",
        NODE_ENV: "production",
      })
    ).toThrow("Agent storage configuration is unavailable")
    expect(() =>
      createAgentStorage({
        MASTRA_STORAGE_AUTH_TOKEN: "agent-token",
        MASTRA_STORAGE_URL: "libsql://agent.example.test",
        NODE_ENV: "production",
      })
    ).not.toThrow()
  })
})

describe("Agent storage restart persistence", () => {
  it("reopens a temporary file-backed store without recreating it per request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mastra-storage-"))
    const url = `file:${join(directory, "restart.db")}`
    const first = createAgentStorage(
      { MASTRA_STORAGE_URL: url, NODE_ENV: "test" },
      "restart-first"
    )

    try {
      await first.init()
      const firstMemory = await first.getStore("memory")
      if (!firstMemory) throw new Error("Memory store is unavailable")
      const threads = await firstMemory.saveThread({
        thread: {
          id: "thread_restart",
          resourceId: "resource_restart",
          createdAt: new Date(),
          updatedAt: new Date(),
          title: "Restart proof",
          metadata: {},
        },
      })
      expect(threads.id).toBe("thread_restart")
      await first.close()

      const reopened = createAgentStorage(
        { MASTRA_STORAGE_URL: url, NODE_ENV: "test" },
        "restart-second"
      )
      await reopened.init()
      const reopenedMemory = await reopened.getStore("memory")
      if (!reopenedMemory) throw new Error("Memory store is unavailable")
      expect(
        await reopenedMemory.getThreadById({
          threadId: "thread_restart",
        })
      ).toMatchObject({
        id: "thread_restart",
        resourceId: "resource_restart",
        title: "Restart proof",
      })
      await reopened.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("persists native user and assistant messages by resource and thread without run-local private bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mastra-memory-"))
    const url = `file:${join(directory, "memory.db")}`
    const resourceId = "resource_private_memory"
    const threadId = "thread_private_memory"
    const privateUrl = "https://private.invalid/object/secret-r2-key"
    const imageBytes = new Uint8Array([251, 255, 239, 190, 173, 222])
    const storage = createAgentStorage(
      { MASTRA_STORAGE_URL: url, NODE_ENV: "test" },
      "private-memory-first"
    )
    const memory = new Memory({
      storage,
      options: {
        generateTitle: false,
        lastMessages: 50,
        semanticRecall: false,
        workingMemory: { enabled: false },
      },
    })
    const agent = new Agent({
      id: "private-memory-agent",
      name: "Private memory test",
      instructions: "Reply briefly.",
      memory,
      model: createScriptedModel([
        {
          parts: [{ type: "text", text: "Saved assistant answer." }],
        },
      ]),
    })

    try {
      const output = await agent.stream(
        [
          {
            id: "user_private_memory",
            role: "user",
            parts: [
              { type: "text", text: "Describe the attached image." },
              {
                type: "data-agent-assets",
                data: { assetIds: ["asset_opaque_1"] },
              },
            ],
          },
        ],
        {
          context: [
            {
              role: "system",
              content: `Resolved private context: ${privateUrl}`,
            },
            ...createCurrentMessageImageContext(
              ["asset_opaque_1"],
              [
                {
                  image: imageBytes,
                  mediaType: "image/webp",
                  type: "image",
                },
              ]
            ),
          ],
          memory: { resource: resourceId, thread: threadId },
        }
      )
      await output.consumeStream()
      expect(await output.text).toBe("Saved assistant answer.")
      await storage.close()

      const reopenedStorage = createAgentStorage(
        { MASTRA_STORAGE_URL: url, NODE_ENV: "test" },
        "private-memory-second"
      )
      const reopenedMemory = new Memory({
        storage: reopenedStorage,
        options: {
          generateTitle: false,
          lastMessages: 50,
          semanticRecall: false,
          workingMemory: { enabled: false },
        },
      })
      const recalled = await reopenedMemory.recall({
        page: 0,
        perPage: false,
        resourceId,
        threadId,
      })
      const serialized = JSON.stringify(recalled.messages)

      expect(recalled.messages.map((message) => message.role)).toEqual([
        "user",
        "assistant",
      ])
      expect(serialized).toContain("asset_opaque_1")
      expect(serialized).toContain("Saved assistant answer.")
      expect(serialized).not.toContain(privateUrl)
      expect(serialized).not.toContain("secret-r2-key")
      expect(serialized).not.toContain("data:image")
      expect(serialized).not.toContain("base64")
      expect(serialized).not.toContain("251,255,239,190,173,222")

      await expect(
        reopenedMemory.recall({
          page: 0,
          perPage: false,
          resourceId: "resource_other",
          threadId,
        })
      ).rejects.toThrow("resource_other was queried")
      await expect(
        reopenedMemory.recall({
          page: 0,
          perPage: false,
          resourceId,
          threadId: "thread_other",
        })
      ).rejects.toThrow("thread_other")
      await reopenedStorage.close()
    } finally {
      await storage.close().catch(() => undefined)
      await rm(directory, { force: true, recursive: true })
    }
  })
})
