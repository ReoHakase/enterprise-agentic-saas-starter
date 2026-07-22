import type { AgentInternalApiContract } from "@enterprise-agentic-saas/api/agent-client"
import type { ModelMessage } from "ai"
import { describe, expect, it, vi } from "vitest"

import {
  agentChatBodySchema,
  appendCurrentMessageImages,
  hasBoundedCurrentUserMessage,
  loadCurrentMessageImages,
  parseAgentChatInput,
} from "./chat-input"

type ImageApi = Pick<AgentInternalApiContract, "getAgentImageForModel">

describe("agent chat input", () => {
  it("strictly validates body fields, limits assets, and de-duplicates in order", () => {
    expect(
      parseAgentChatInput({
        assetIds: ["asset_2", "asset_1", "asset_2"],
        timezone: "Asia/Tokyo",
      })
    ).toEqual({ assetIds: ["asset_2", "asset_1"], timezone: "Asia/Tokyo" })

    expect(
      agentChatBodySchema.safeParse({
        assetIds: ["a", "b", "c", "d", "e"],
        timezone: "Asia/Tokyo",
      }).success
    ).toBe(false)
    expect(
      agentChatBodySchema.safeParse({
        assetIds: [],
        timezone: "Not/A_Zone",
      }).success
    ).toBe(false)
    expect(
      agentChatBodySchema.safeParse({
        assetIds: [],
        extra: true,
        timezone: "Asia/Tokyo",
      }).success
    ).toBe(false)
    expect(parseAgentChatInput(null)).toBeUndefined()
    expect(parseAgentChatInput({ assetIds: [], timezone: "Etc/UTC" })).toEqual({
      assetIds: [],
      timezone: "UTC",
    })
  })

  it("enforces strict bounded parts on the latest user turn", () => {
    expect(
      hasBoundedCurrentUserMessage([
        {
          id: "message_1",
          role: "user",
          parts: [{ type: "text", text: "x".repeat(20_000) }],
        },
      ])
    ).toBe(true)
    expect(
      hasBoundedCurrentUserMessage([
        {
          id: "message_1",
          role: "user",
          parts: [{ type: "text", text: "x".repeat(20_001) }],
        },
      ])
    ).toBe(false)
    expect(
      hasBoundedCurrentUserMessage([
        {
          id: "message_1",
          role: "user",
          parts: [{ type: "text", text: "ok" }],
        },
        {
          id: "message_2",
          role: "assistant",
          parts: [{ type: "text", text: "tool output" }],
        },
      ])
    ).toBe(true)
    expect(hasBoundedCurrentUserMessage([])).toBe(false)
    expect(
      hasBoundedCurrentUserMessage([
        { id: "message_1", role: "user", parts: "invalid" },
      ])
    ).toBe(false)
    expect(
      hasBoundedCurrentUserMessage([
        {
          id: "message_1",
          role: "user",
          parts: [{ type: "text", text: 123 }],
        },
      ])
    ).toBe(false)
    expect(
      hasBoundedCurrentUserMessage([
        {
          id: "message_1",
          role: "user",
          parts: [null, { type: "image", image: "ignored" }],
        },
      ])
    ).toBe(false)
    expect(
      hasBoundedCurrentUserMessage([
        { role: "user", parts: [{ type: "text", text: "missing id" }] },
      ])
    ).toBe(false)
    expect(
      hasBoundedCurrentUserMessage([
        {
          id: "message_1",
          metadata: { arbitrary: true },
          role: "user",
          parts: [{ type: "text", text: "unexpected metadata" }],
        },
      ])
    ).toBe(false)
  })
})

describe("current-message model images", () => {
  it("loads bounded WebP responses through the run grant", async () => {
    const getAgentImageForModel = vi
      .fn<ImageApi["getAgentImageForModel"]>()
      .mockImplementation(({ assetId }) =>
        Promise.resolve(
          new Response(new Uint8Array([assetId === "asset_1" ? 1 : 2]), {
            headers: {
              "content-length": "1",
              "content-type": "image/webp",
            },
          })
        )
      )

    const images = await loadCurrentMessageImages(
      { getAgentImageForModel },
      "run_0123456789abcdefghijklmnopqrstuvwxyz",
      ["asset_1", "asset_2"]
    )

    const imageBytes = images.map((part) => {
      if (!(part.image instanceof Uint8Array)) {
        throw new Error("Expected an in-memory image")
      }
      return Array.from(part.image)
    })
    expect(imageBytes).toEqual([[1], [2]])
    expect(getAgentImageForModel).toHaveBeenCalledTimes(2)
    expect(getAgentImageForModel.mock.calls[0]?.[0]).toEqual({
      assetId: "asset_1",
      grant: "run_0123456789abcdefghijklmnopqrstuvwxyz",
    })
  })

  it("rejects non-WebP, declared overflow, and streamed overflow", async () => {
    const call = (response: Response) =>
      loadCurrentMessageImages(
        { getAgentImageForModel: () => Promise.resolve(response) },
        "run_0123456789abcdefghijklmnopqrstuvwxyz",
        ["asset_1"]
      )

    await expect(
      call(
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/png" },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      call(
        new Response(null, {
          headers: { "content-type": "image/webp" },
          status: 500,
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      call(
        new Response(null, {
          headers: { "content-type": "image/webp" },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      call(
        new Response(new Uint8Array([1]), {
          headers: {
            "content-length": "invalid",
            "content-type": "image/webp",
          },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")

    const cancelFailure = new ReadableStream<Uint8Array>({
      cancel: () => {
        throw new Error("private cancellation failure")
      },
      start: (controller) => controller.enqueue(new Uint8Array([1])),
    })
    await expect(
      call(
        new Response(cancelFailure, {
          headers: { "content-type": "image/png" },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      call(
        new Response(new Uint8Array([1]), {
          headers: {
            "content-length": String(4 * 1024 * 1024 + 1),
            "content-type": "image/webp",
          },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      call(
        new Response(new Uint8Array(4 * 1024 * 1024 + 1), {
          headers: { "content-type": "image/webp" },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
  })

  it("adds byte parts only to an ephemeral copy of the latest user message", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "old" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "describe this" },
      { role: "assistant", content: "client tool call" },
    ]
    const original = structuredClone(messages)
    const bytes = new Uint8Array([1, 2, 3])

    const result = appendCurrentMessageImages(
      messages,
      ["asset_1"],
      [{ image: bytes, mediaType: "image/webp", type: "image" }]
    )

    expect(messages).toEqual(original)
    expect(result[0]).toEqual(messages[0])
    expect(result[2]?.role).toBe("user")
    expect(result[2]?.content).toEqual([
      { text: "describe this", type: "text" },
      {
        text: expect.stringContaining("asset_1"),
        type: "text",
      },
      { image: bytes, mediaType: "image/webp", type: "image" },
    ])
    expect(JSON.stringify(result)).not.toContain("base64")
  })

  it("handles empty input and rejects inconsistent ephemeral image data", () => {
    const messages: ModelMessage[] = [
      {
        content: [{ text: "describe this", type: "text" }],
        role: "user",
      },
    ]
    expect(appendCurrentMessageImages(messages, [], [])).toEqual(messages)
    expect(() => appendCurrentMessageImages(messages, ["asset_1"], [])).toThrow(
      "Agent image is unavailable"
    )
    expect(() =>
      appendCurrentMessageImages(
        [{ content: "answer", role: "assistant" }],
        ["asset_1"],
        [
          {
            image: new Uint8Array([1]),
            mediaType: "image/webp",
            type: "image",
          },
        ]
      )
    ).toThrow("Agent message is unavailable")

    const result = appendCurrentMessageImages(
      messages,
      ["asset_1"],
      [
        {
          image: new Uint8Array([1]),
          mediaType: "image/webp",
          type: "image",
        },
      ]
    )
    expect(result[0]?.content).toEqual(
      expect.arrayContaining([{ text: "describe this", type: "text" }])
    )
  })
})
