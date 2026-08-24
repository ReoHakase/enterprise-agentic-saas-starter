import { Agent } from "@mastra/core/agent"
import type {
  MastraDBMessage,
  MastraMessagePart,
} from "@mastra/core/agent/message-list"
import { createTool } from "@mastra/core/tools"
import { Memory } from "@mastra/memory"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createAgentStorage } from "../../storage"
import { createScriptedModel } from "../../test-support/scripted-model"
import { productMemoryPersistenceGuard } from "./memory-persistence-guard"

const recallMessages = async (
  memory: Memory,
  resourceId: string,
  threadId: string
) =>
  (
    await memory.recall({
      page: 0,
      perPage: false,
      resourceId,
      threadId,
    })
  ).messages

describe("Product Agent Memory永続化guard", () => {
  it("Mastraの一時model出力copyだけを除去する", () => {
    const parts: MastraMessagePart[] = JSON.parse(
      JSON.stringify([
        {
          type: "reasoning",
          reasoning: "Inspect the complete issue context.",
          details: [],
          providerMetadata: {
            openrouter: {
              reasoning_details: [
                {
                  type: "reasoning.encrypted",
                  data: "OPAQUE_REASONING_CONTEXT_SENTINEL",
                },
              ],
            },
            customProvider: { debugId: "PROVIDER_DEBUG_SENTINEL" },
          },
        },
        {
          type: "tool-invocation",
          toolInvocation: {
            state: "result",
            toolCallId: "call_invalid",
            toolName: "strict_tool",
            args: { extra: "INVALID_TOOL_ARGUMENT_SENTINEL" },
            result: {
              error: true,
              message: "Provided arguments failed validation.",
              validationErrors: {
                errors: ["Expected safe string"],
                fields: {},
              },
            },
          },
          providerMetadata: {
            mastra: {
              modelOutput: {
                type: "content",
                value: [
                  {
                    type: "media",
                    data: "TRANSIENT_RAW_MEDIA_SENTINEL",
                    mediaType: "image/webp",
                  },
                ],
              },
              debugId: "MASTRA_DEBUG_SENTINEL",
            },
            customProvider: { requestId: "PROVIDER_REQUEST_SENTINEL" },
          },
        },
        {
          type: "file",
          data: { type: "data", data: "NATIVE_FILE_SENTINEL" },
          mimeType: "image/png",
        },
        {
          type: "source",
          source: {
            sourceType: "url",
            id: "provider-source-id",
            title: "Provider source",
            url: "https://example.com/provider-source?debug=1#fragment",
          },
        },
        {
          type: "source-document",
          sourceId: "source-document-id",
          mediaType: "application/pdf",
          title: "Provider document",
          filename: "document.pdf",
        },
      ])
    )
    const message: MastraDBMessage = {
      id: "message_native_context",
      role: "assistant",
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
      content: { format: 2, parts },
    }

    const [guarded] = productMemoryPersistenceGuard.processOutputResult({
      messages: [message],
    })
    const guardedParts = guarded?.content.parts
    const serialized = JSON.stringify(guarded)

    expect(guardedParts?.[0]).toBe(parts[0])
    expect(guardedParts?.[1]).toEqual({
      ...parts[1],
      providerMetadata: {
        mastra: { debugId: "MASTRA_DEBUG_SENTINEL" },
        customProvider: { requestId: "PROVIDER_REQUEST_SENTINEL" },
      },
    })
    expect(guardedParts?.slice(2)).toEqual(parts.slice(2))
    expect(serialized).not.toContain("TRANSIENT_RAW_MEDIA_SENTINEL")
    expect(serialized).not.toContain("modelOutput")
    expect(serialized).toContain("OPAQUE_REASONING_CONTEXT_SENTINEL")
    expect(serialized).toContain("PROVIDER_DEBUG_SENTINEL")
    expect(serialized).toContain("INVALID_TOOL_ARGUMENT_SENTINEL")
    expect(serialized).toContain("validationErrors")
    expect(serialized).toContain("NATIVE_FILE_SENTINEL")
    expect(serialized).toContain("provider-source?debug=1#fragment")
    expect(serialized).toContain("source-document-id")
    expect("processOutputStream" in productMemoryPersistenceGuard).toBe(false)
  })

  it("Mastraのcopyを永続化せずraw mediaを現在turnに保持する", async () => {
    const storage = createAgentStorage(
      { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
      "memory-raw-media-persistence-guard"
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
    const rawMedia = "BASE64_PRIVATE_MEDIA_SENTINEL"
    let call = 0
    let secondPrompt = ""
    const model = createScriptedModel((options) => {
      call += 1
      if (call === 1) {
        return {
          finishReason: "tool-calls",
          parts: [
            {
              type: "tool-call",
              input: {},
              toolCallId: "call_raw_media",
              toolName: "read_media",
            },
          ],
        }
      }
      secondPrompt = JSON.stringify(options.prompt)
      return { parts: [{ type: "text", text: "Image inspected." }] }
    })
    const readMedia = createTool({
      id: "read_media",
      description: "Read test media.",
      inputSchema: z.strictObject({}),
      strict: true,
      execute: async () => ({ assetId: "asset_safe_1", byteLength: 24 }),
      toModelOutput: () => ({
        type: "content",
        value: [{ type: "media", data: rawMedia, mediaType: "image/webp" }],
      }),
    })
    const agent = new Agent({
      id: "raw-media-memory-agent",
      name: "Raw media Memory test",
      instructions: "Inspect the image.",
      memory,
      model,
      outputProcessors: [productMemoryPersistenceGuard],
      tools: { read_media: readMedia },
    })
    const resourceId = "resource_raw_media"
    const threadId = "thread_raw_media"

    try {
      await storage.init()
      const output = await agent.stream("Inspect it.", {
        memory: { resource: resourceId, thread: threadId },
      })
      await output.consumeStream()
      const recalled = JSON.stringify(
        await recallMessages(memory, resourceId, threadId)
      )

      expect(secondPrompt).toContain(rawMedia)
      expect(recalled).toContain("asset_safe_1")
      expect(recalled).toContain("Image inspected.")
      expect(recalled).not.toContain(rawMedia)
      expect(recalled).not.toContain("modelOutput")
    } finally {
      await storage.close().catch(() => undefined)
    }
  })
})
