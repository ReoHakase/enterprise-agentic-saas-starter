import type { MastraDBMessage } from "@mastra/core/agent"
import { MessageList } from "@mastra/core/agent/message-list"
import { describe, expect, it } from "vitest"

import { productMemoryOutputProcessor } from "./memory-output-processor"

describe("OpenRouter reasoning details in canonical Memory", () => {
  it("allowlists and replays details in provider order", () => {
    const reasoningMessage: MastraDBMessage = {
      id: "reasoning-message",
      role: "assistant",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      threadId: "thread_1",
      resourceId: "resource_1",
      content: {
        format: 2,
        parts: JSON.parse(
          JSON.stringify([
            {
              type: "reasoning",
              text: "Issueの状態と依存関係を確認する。",
              providerMetadata: {
                openrouter: {
                  reasoning_details: [
                    {
                      type: "reasoning.summary",
                      summary: "Check the issue and dependencies.",
                      format: "openai-responses-v1",
                      index: 0,
                      providerSecret: "PRIVATE_DETAIL_SENTINEL",
                    },
                    {
                      type: "reasoning.encrypted",
                      data: "ENCRYPTED_REASONING_SENTINEL",
                      id: "reasoning_1",
                      format: "azure-openai-responses-v1",
                      index: 1,
                    },
                    {
                      type: "reasoning.text",
                      text: "Continue with the issue lookup.",
                      signature: "REASONING_SIGNATURE_SENTINEL",
                      index: 2,
                    },
                    {
                      type: "reasoning.unsupported",
                      data: "PRIVATE_UNSUPPORTED_SENTINEL",
                    },
                  ],
                },
                privateProvider: { token: "PRIVATE_PROVIDER_TOKEN_SENTINEL" },
              },
            },
          ])
        ),
      },
    }

    const serialized = JSON.stringify(
      productMemoryOutputProcessor.processOutputResult({
        messages: [reasoningMessage],
      })
    )
    expect(serialized).toContain("Issueの状態と依存関係を確認する。")
    expect(serialized).toContain("ENCRYPTED_REASONING_SENTINEL")
    expect(serialized).toContain("REASONING_SIGNATURE_SENTINEL")
    for (const privateValue of [
      "PRIVATE_DETAIL_SENTINEL",
      "PRIVATE_UNSUPPORTED_SENTINEL",
      "PRIVATE_PROVIDER_TOKEN_SENTINEL",
    ]) {
      expect(serialized).not.toContain(privateValue)
    }

    const restored: MastraDBMessage[] = JSON.parse(serialized)
    const restoredMessage = restored[0]
    if (!restoredMessage) throw new Error("Restored message unavailable")
    restoredMessage.createdAt = new Date(restoredMessage.createdAt)
    const replayed = JSON.stringify(
      new MessageList({ resourceId: "resource_1", threadId: "thread_1" })
        .add(restored, "memory")
        .get.all.aiV5.model()
    )
    expect(replayed).toContain("reasoning_details")
    expect(replayed.indexOf("reasoning.summary")).toBeLessThan(
      replayed.indexOf("reasoning.encrypted")
    )
    expect(replayed.indexOf("reasoning.encrypted")).toBeLessThan(
      replayed.indexOf("reasoning.text")
    )
    expect(replayed).toContain("ENCRYPTED_REASONING_SENTINEL")
  })
})
