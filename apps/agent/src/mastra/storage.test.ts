import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Agent } from "@mastra/core/agent"
import { Mastra } from "@mastra/core/mastra"
import { Memory } from "@mastra/memory"
import { describe, expect, it, vi } from "vitest"

import {
  createProductAgent,
  createProductAgentMemory,
} from "./agents/product-agent"
import { createAgentRuntimeComposition } from "./composition/runtime-composition"
import { createCurrentMessageImageContext } from "./core/messages/chat-input"
import { handleMemoryHistory } from "./runtime/memory-routes"
import { createAgentStorage } from "./storage"
import { createScriptedModel } from "./test-support/scripted-model"
import { createWebSearchTool } from "./tools/web-search/tool"

const noop = () => undefined

const createUnscopedProductAgent = (
  storage: ReturnType<typeof createAgentStorage>,
  model: ReturnType<typeof createScriptedModel>
) => {
  const productAgent = createProductAgent({
    allowUnscopedModel: true,
    memory: createProductAgentMemory(storage),
    model,
    resolveExecution: () => {
      throw new Error("Unexpected scoped execution")
    },
    webSearchTool: createWebSearchTool(
      async () => ({ finishReason: "stop", sources: [], text: "unused" }),
      () => {
        throw new Error("Unexpected scoped execution")
      }
    ),
  })
  return new Mastra({
    agents: { productAgent },
    logger: false,
    storage,
  }).getAgentById("product-agent")
}

describe("Agentストレージ設定", () => {
  it("本番ストレージ設定がない場合は安全側に失敗する", () => {
    expect(() => createAgentStorage({ NODE_ENV: "production" })).toThrow(
      "Agent storage configuration is unavailable"
    )
  })

  it("本番データベースに認証済みリモート接続を要求する", () => {
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

  it("ローカルHTTPのスキーマ初期化を合流して直列化する", async () => {
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

  it("失敗したローカルHTTPのスキーマ初期化を再試行できる", async () => {
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

describe("Product Agentの標準Memory契約", () => {
  it("後続ターン向けに完全なskill文脈をMessageHistoryへ保持する", async () => {
    const storage = createAgentStorage(
      { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
      "processor-order"
    )
    const rawSkillInstructionSentinel =
      "画像の asset ID は、サーバーが現在のメッセージ"
    const agent = createUnscopedProductAgent(
      storage,
      createScriptedModel([
        {
          finishReason: "tool-calls",
          parts: [
            {
              type: "tool-call",
              input: { name: "issue-triage" },
              toolCallId: "call_skill",
              toolName: "skill",
            },
          ],
        },
        { parts: [{ type: "text", text: "Triage completed." }] },
      ])
    )

    try {
      await storage.init()
      const output = await agent.stream("Triage this request.", {
        memory: { resource: "resource_processor", thread: "thread_processor" },
      })
      await output.consumeStream()
      const memory = await agent.getMemory()
      if (!(memory instanceof Memory)) throw new Error("Memory unavailable")
      const recalled = await memory.recall({
        page: 0,
        perPage: false,
        resourceId: "resource_processor",
        threadId: "thread_processor",
      })
      const serialized = JSON.stringify(recalled.messages)

      expect(serialized).toContain("Triage completed.")
      expect(serialized).toContain('"name":"issue-triage"')
      expect(serialized).toContain(rawSkillInstructionSentinel)
    } finally {
      await storage.close().catch(() => undefined)
    }
  })

  it("provider失敗をMessageHistoryへ永続化しない", async () => {
    const storage = createAgentStorage(
      { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
      "provider-error-memory"
    )
    const sentinel = "PRIVATE_RAW_PROVIDER_ERROR_SENTINEL"
    const agent = createUnscopedProductAgent(
      storage,
      createScriptedModel([{ error: new Error(sentinel), parts: [] }])
    )

    try {
      await storage.init()
      try {
        const output = await agent.stream("Trigger the provider failure.", {
          memory: {
            resource: "resource_provider_error",
            thread: "thread_provider_error",
          },
        })
        await output.consumeStream()
      } catch {
        // 標準streamは消費前または消費中にrejectする場合がある
      }
      const memory = await agent.getMemory()
      if (!(memory instanceof Memory)) throw new Error("Memory unavailable")
      const recalled = await memory.recall({
        page: 0,
        perPage: false,
        resourceId: "resource_provider_error",
        threadId: "thread_provider_error",
      })

      expect(JSON.stringify(recalled.messages)).not.toContain(sentinel)
    } finally {
      await storage.close().catch(() => undefined)
    }
  })

  it("標準Memoryの永続化に失敗しても完了済みProduct Agent streamを成功扱いに保つ", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mastra-best-effort-"))
    const storage = createAgentStorage(
      {
        MASTRA_STORAGE_URL: `file:${join(directory, "memory.db")}`,
        NODE_ENV: "test",
      },
      "best-effort-memory"
    )
    let releaseClosed: () => void = noop
    const closed = new Promise<void>((resolve) => {
      releaseClosed = resolve
    })
    const agent = createUnscopedProductAgent(
      storage,
      createScriptedModel([
        {
          parts: [{ type: "text", text: "Completed before persistence." }],
          stream: [
            { value: { type: "stream-start", warnings: [] } },
            { value: { type: "text-start", id: "best-effort-text" } },
            {
              onEmit: () => {
                void storage.close().finally(releaseClosed)
              },
              value: {
                type: "text-delta",
                id: "best-effort-text",
                delta: "Completed before persistence.",
              },
            },
            {
              waitFor: closed,
              value: { type: "text-end", id: "best-effort-text" },
            },
            {
              value: {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: {
                    cacheRead: 0,
                    cacheWrite: 0,
                    noCache: 1,
                    total: 1,
                  },
                  outputTokens: {
                    reasoning: 0,
                    text: 1,
                    total: 1,
                  },
                },
              },
            },
          ],
        },
      ])
    )

    try {
      await storage.init()
      const output = await agent.stream("Save this response.", {
        memory: {
          resource: "resource_best_effort",
          thread: "thread_best_effort",
        },
      })

      const chunks: unknown[] = []
      for await (const chunk of output.fullStream) chunks.push(chunk)

      expect(JSON.stringify(chunks)).toContain("Completed before persistence.")
      await closed
    } finally {
      await storage.close().catch(() => undefined)
      await rm(directory, { force: true, recursive: true })
    }
  })
})

describe("Agentストレージの再起動後永続性", () => {
  it("別threadから再取得したmessageをmodel promptへ混入させない", async () => {
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
        // 実際のMemory recall経路を実行するためnative streamを消費する
        void chunk
      }
      const sentinelRun = await agent.stream("Sentinel request", {
        memory: { resource: resourceId, thread: sentinelThreadId },
      })
      for await (const chunk of sentinelRun.fullStream) {
        // 実際のMemory recall経路を実行するためnative streamを消費する
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
      caseId: "partial-text",
      name: "部分text",
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
      caseId: "partial-tool-input",
      name: "部分tool入力",
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
    "$nameをsession内に限定して正規の利用者messageだけを再読込する",
    async ({ abortAt, caseId, stream }) => {
      const directory = await mkdtemp(join(tmpdir(), "mastra-abort-memory-"))
      const url = `file:${join(directory, "memory.db")}`
      const storage = createAgentStorage(
        { MASTRA_STORAGE_URL: url, NODE_ENV: "test" },
        `abort-memory-first-${caseId}`
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
        id: `abort-memory-agent-${caseId}`,
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
          // Mastraが正規のmemoryをcommitするようnative streamを消費する
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

  it("実行内private byteを含めずresourceとthreadごとに利用者とassistantのmessageを永続化する", async () => {
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
