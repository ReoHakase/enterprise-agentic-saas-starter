import { describe, expect, it, vi } from "vitest"

import type { AgentControlPlanePort as AgentInternalGateway } from "../../runtime/ports"
import {
  createCurrentMessageImageContext,
  loadCurrentMessageImages,
} from "./chat-input"

type ImageApi = Pick<AgentInternalGateway, "getAgentImageForModel">

const loadSingleCurrentMessageImage = (response: Response) =>
  loadCurrentMessageImages(
    { getAgentImageForModel: () => Promise.resolve(response) },
    "run_0123456789abcdefghijklmnopqrstuvwxyz",
    ["asset_1"]
  )

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
    await expect(
      loadSingleCurrentMessageImage(
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/png" },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      loadSingleCurrentMessageImage(
        new Response(null, {
          headers: { "content-type": "image/webp" },
          status: 500,
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      loadSingleCurrentMessageImage(
        new Response(null, {
          headers: { "content-type": "image/webp" },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      loadSingleCurrentMessageImage(
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
      loadSingleCurrentMessageImage(
        new Response(cancelFailure, {
          headers: { "content-type": "image/png" },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      loadSingleCurrentMessageImage(
        new Response(new Uint8Array([1]), {
          headers: {
            "content-length": String(4 * 1024 * 1024 + 1),
            "content-type": "image/webp",
          },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
    await expect(
      loadSingleCurrentMessageImage(
        new Response(new Uint8Array(4 * 1024 * 1024 + 1), {
          headers: { "content-type": "image/webp" },
        })
      )
    ).rejects.toThrow("Agent image is unavailable")
  })

  it("creates a run-local image context without duplicating user text", () => {
    const bytes = new Uint8Array([1, 2, 3])

    const result = createCurrentMessageImageContext(
      ["asset_1"],
      [{ image: bytes, mediaType: "image/webp", type: "image" }]
    )

    expect(result).toEqual([
      {
        role: "user",
        content: [
          {
            text: expect.stringContaining("asset_1"),
            type: "text",
          },
          { image: bytes, mediaType: "image/webp", type: "image" },
        ],
      },
    ])
    expect(JSON.stringify(result)).not.toContain("describe this")
    expect(JSON.stringify(result)).not.toContain("base64")
  })

  it("handles empty input and rejects inconsistent ephemeral image data", () => {
    expect(createCurrentMessageImageContext([], [])).toEqual([])
    expect(() => createCurrentMessageImageContext(["asset_1"], [])).toThrow(
      "Agent image is unavailable"
    )
    expect(() =>
      createCurrentMessageImageContext(
        [],
        [
          {
            image: new Uint8Array([1]),
            mediaType: "image/webp",
            type: "image",
          },
        ]
      )
    ).toThrow("Agent image is unavailable")
  })
})
