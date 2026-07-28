import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Agent } from "@mastra/core/agent"
import { Memory } from "@mastra/memory"
import { describe, expect, it, vi } from "vitest"

import { createAgentRuntimeComposition } from "./composition/runtime-composition"
import { createCurrentMessageImageContext } from "./core/messages/chat-input"
import { handleMemoryHistory } from "./runtime/memory-routes"
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

  it("coalesces and serializes local HTTP schema initialization", async () => {
    const storage = createAgentStorage(
      {
        MASTRA_STORAGE_URL: "http://127.0.0.1:18080",
        NODE_ENV: "development",
      },
      "serialized-local-http"
    )
    let activeInitializers = 0
    let maximumActiveInitializers = 0
    const stores = Object.values(storage.stores).filter(
      (store) => store !== undefined
    )
    const spies = stores.map((store) =>
      vi.spyOn(store, "init").mockImplementation(async () => {
        activeInitializers += 1
        maximumActiveInitializers = Math.max(
          maximumActiveInitializers,
          activeInitializers
        )
        await new Promise<void>((resolve) => queueMicrotask(resolve))
        activeInitializers -= 1
      })
    )

    try {
      await Promise.all([storage.init(), storage.init(), storage.init()])

      expect(maximumActiveInitializers).toBe(1)
      expect(spies.every((spy) => spy.mock.calls.length === 1)).toBe(true)
    } finally {
      await storage.close()
    }
  })

  it("retries local HTTP schema initialization after a failed attempt", async () => {
    const storage = createAgentStorage(
      {
        MASTRA_STORAGE_URL: "https://agent-storage.example.localhost",
        NODE_ENV: "development",
      },
      "retry-local-http"
    )
    const firstStore = Object.values(storage.stores).find(
      (store) => store !== undefined
    )
    if (!firstStore) throw new Error("Agent storage domains are unavailable")
    const init = vi
      .spyOn(firstStore, "init")
      .mockRejectedValueOnce(new Error("transient schema failure"))
      .mockResolvedValue(undefined)
    const remainingSpies = Object.values(storage.stores)
      .filter((store) => store !== undefined && store !== firstStore)
      .map((store) => vi.spyOn(store, "init").mockResolvedValue(undefined))

    try {
      await expect(storage.init()).rejects.toThrow("transient schema failure")
      await expect(storage.init()).resolves.toBeUndefined()

      expect(init).toHaveBeenCalledTimes(2)
      expect(remainingSpies.every((spy) => spy.mock.calls.length === 1)).toBe(
        true
      )
    } finally {
      await storage.close()
    }
  })
})

describe("Agent storage restart persistence", () => {
  it("keeps another thread's recalled message out of the model prompt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mastra-thread-isolation-"))
    const storage = createAgentStorage(
      {
        MASTRA_STORAGE_URL: `file:${join(directory, "memory.db")}`,
        NODE_ENV: "test",
      },
      "thread-isolation"
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
    const resourceId = "resource_thread_isolation"
    const sentinelThreadId = "thread_with_private_sentinel"
    const targetThreadId = "thread_without_private_sentinel"
    const sentinel = "PRIVATE_OTHER_THREAD_SENTINEL"
    const prompts: string[] = []
    const model = createScriptedModel(
      (options) => {
        prompts.push(JSON.stringify(options.prompt))
        return { parts: [{ type: "text", text: "isolated" }] }
      },
      { repeat: true }
    )
    const agent = new Agent({
      id: "thread-isolation-agent",
      name: "Thread isolation test",
      instructions: "Reply briefly.",
      memory,
      model,
    })
    const now = new Date()
    try {
      await storage.init()
      await memory.saveThread({
        thread: {
          id: sentinelThreadId,
          resourceId,
          createdAt: now,
          updatedAt: now,
          title: "Sentinel",
          metadata: {},
        },
      })
      await memory.saveMessages({
        messages: [
          {
            id: "message_private_sentinel",
            role: "user",
            createdAt: now,
            threadId: sentinelThreadId,
            resourceId,
            content: {
              format: 2,
              parts: [{ type: "text", text: sentinel }],
            },
          },
        ],
      })
      await memory.createThread({
        threadId: targetThreadId,
        resourceId,
        title: "Target",
      })
      const target = await agent.stream("Target request", {
        memory: { resource: resourceId, thread: targetThreadId },
      })
      for await (const chunk of target.fullStream) {
        // Consume the native stream so the actual Memory recall path runs.
        void chunk
      }
      const sentinelRun = await agent.stream("Sentinel request", {
        memory: { resource: resourceId, thread: sentinelThreadId },
      })
      for await (const chunk of sentinelRun.fullStream) {
        // Consume the native stream so the actual Memory recall path runs.
        void chunk
      }

      expect(prompts).toHaveLength(2)
      expect(prompts[0]).not.toContain(sentinel)
      expect(prompts[1]).toContain(sentinel)
    } finally {
      await storage.close().catch(() => undefined)
      await rm(directory, { force: true, recursive: true })
    }
  })

  it.each([
    {
      name: "partial text",
      abortAt: "text-delta",
      stream: [
        { value: { type: "stream-start", warnings: [] } },
        { value: { type: "text-start", id: "partial-text" } },
        {
          value: {
            type: "text-delta",
            id: "partial-text",
            delta: "PARTIAL_KEEP",
          },
        },
        {
          delayMs: 10_000,
          value: { type: "text-end", id: "partial-text" },
        },
      ],
    },
    {
      name: "partial tool input",
      abortAt: "tool-input-delta",
      stream: [
        { value: { type: "stream-start", warnings: [] } },
        {
          value: {
            type: "tool-input-start",
            id: "partial-tool",
            toolName: "get_issue",
          },
        },
        {
          value: {
            type: "tool-input-delta",
            id: "partial-tool",
            delta: '{"lookup":"id","id":"issue_',
          },
        },
        {
          delayMs: 10_000,
          value: {
            type: "tool-input-end",
            id: "partial-tool",
          },
        },
      ],
    },
  ])(
    "keeps $name session-local and reloads canonical user-only memory",
    async ({ abortAt, name, stream }) => {
      const directory = await mkdtemp(join(tmpdir(), "mastra-abort-memory-"))
      const url = `file:${join(directory, "memory.db")}`
      const storage = createAgentStorage(
        { MASTRA_STORAGE_URL: url, NODE_ENV: "test" },
        `abort-memory-first-${name}`
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
      const abortController = new AbortController()
      const agent = new Agent({
        id: `abort-memory-agent-${name}`,
        name: "Abort memory test",
        instructions: "Reply briefly.",
        memory,
        model: createScriptedModel(
          [
            {
              parts: [],
              stream: stream.map((chunk) => ({
                ...chunk,
                ...(Reflect.get(chunk.value, "type") === abortAt
                  ? {
                      onEmit: () =>
                        abortController.abort(
                          new DOMException("Stopped by user", "AbortError")
                        ),
                    }
                  : {}),
              })),
            },
          ],
          { repeat: true }
        ),
      })
      const caseId = name.replaceAll(" ", "-")
      const resourceId = `resource-${caseId}`
      const threadId = `thread-${caseId}`
      let reopenedComposition:
        | ReturnType<typeof createAgentRuntimeComposition>
        | undefined

      try {
        await storage.init()
        const output = await agent.stream("Keep the user message.", {
          abortSignal: abortController.signal,
          memory: { resource: resourceId, thread: threadId },
        })
        for await (const chunk of output.fullStream) {
          void chunk
          // Consume the native stream so Mastra commits its canonical memory.
        }
        await memory.recall({
          page: 0,
          perPage: false,
          resourceId,
          threadId,
        })
        await storage.close()

        reopenedComposition = createAgentRuntimeComposition({
          AGENT_RUNS_ENABLED: "1",
          AGENT_VISION_ENABLED: "0",
          AGENT_WRITES_ENABLED: "0",
          MASTRA_STORAGE_URL: url,
          NODE_ENV: "test",
          SENTRY_ENVIRONMENT: "test",
        })
        await reopenedComposition.storage.init()
        const freshMemory = await reopenedComposition.productAgent.getMemory()
        if (!(freshMemory instanceof Memory)) {
          throw new Error("Fresh runtime memory unavailable")
        }
        expect(
          await freshMemory.getThreadById({ resourceId, threadId })
        ).toMatchObject({ id: threadId })
        const history = await handleMemoryHistory(
          new Request("https://agent.internal/memory/history", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              page: 0,
              perPage: 40,
              threadId,
              ticket: "ticket_reload",
            }),
          }),
          { AGENT_INTERNAL_API: {} },
          {
            mastra: reopenedComposition.mastra,
            createControlPlane: () => ({
              settleMemoryCommit: () =>
                Promise.reject(new Error("Memory settlement unavailable")),
              consumeConnectionTicket: async () => ({
                grant: "grant_reload_12345678901234567890",
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                memoryResourceId: resourceId,
                user: { name: "Reload User", profileImage: null },
                organization: {
                  name: "Reload Org",
                  slug: "reload-org",
                  role: "member",
                  permissions: {
                    canReadIssues: true,
                    canCreateIssues: true,
                    canUpdateIssues: true,
                    canDeleteOwnIssues: true,
                    canDeleteAnyIssue: false,
                  },
                },
                thread: { id: threadId, title: "Reload thread" },
              }),
            }),
          }
        )
        if (history.status !== 200) {
          throw new Error(
            `Fresh runtime history failed: ${await history.text()}`
          )
        }
        const recalled: { messages: unknown[] } = await history.json()

        expect(recalled.messages).toHaveLength(1)
        expect(recalled.messages[0]).toMatchObject({ role: "user" })
        const serialized = JSON.stringify(recalled.messages)
        expect(serialized).toContain("Keep the user message.")
        expect(serialized).not.toContain("PARTIAL_KEEP")
        expect(serialized).not.toContain("tool-input")
        expect(serialized).not.toContain("data-run")
      } finally {
        await storage.close().catch(() => undefined)
        await reopenedComposition?.storage.close().catch(() => undefined)
        await rm(directory, { force: true, recursive: true })
      }
    }
  )

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
