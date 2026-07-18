import { describe, expect, it, vi } from "vitest"

import { type ImagesSmokeBinding, handleImagesSmokeRequest } from "./worker"

const token = "a".repeat(64)

const createImagesBinding = () => {
  type Transformer = ReturnType<ImagesSmokeBinding["input"]>
  type Output = ReturnType<Transformer["transform"]>["output"]

  const response = vi.fn<() => Response>(
    () =>
      new Response(new Uint8Array(30), {
        headers: { "Content-Type": "image/webp" },
      })
  )
  const output = vi.fn<Output>(async () => ({ response }))
  const transform = vi.fn<Transformer["transform"]>(() => ({ output }))
  const input = vi.fn<ImagesSmokeBinding["input"]>(() => ({ transform }))

  return {
    binding: { input },
    input,
    transform,
    output,
  }
}

describe("Images remote smoke Worker", () => {
  it("does not access Images before authenticating", async () => {
    const images = createImagesBinding()
    const response = await handleImagesSmokeRequest(
      new Request("https://smoke.invalid/transform", {
        method: "POST",
        body: new Uint8Array([1]),
        headers: { "Content-Type": "image/png" },
      }),
      { IMAGES: images.binding, SMOKE_TOKEN: token }
    )

    expect(response.status).toBe(401)
    expect(images.input).not.toHaveBeenCalled()
  })

  it("applies the fixed transform and strips provider headers", async () => {
    const images = createImagesBinding()
    const response = await handleImagesSmokeRequest(
      new Request("https://smoke.invalid/transform", {
        method: "POST",
        body: new Uint8Array([1]),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/png",
        },
      }),
      { IMAGES: images.binding, SMOKE_TOKEN: token }
    )

    expect(response.status).toBe(200)
    expect(images.transform).toHaveBeenCalledWith({
      width: 360,
      fit: "scale-down",
    })
    expect(images.output).toHaveBeenCalledWith({
      format: "image/webp",
      quality: 75,
      anim: false,
    })
    expect(response.headers.get("Content-Type")).toBe("image/webp")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("redacts provider failures", async () => {
    const images = createImagesBinding()
    images.output.mockRejectedValueOnce(new Error("provider payload"))
    const response = await handleImagesSmokeRequest(
      new Request("https://smoke.invalid/transform", {
        method: "POST",
        body: new Uint8Array([1]),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/png",
        },
      }),
      { IMAGES: images.binding, SMOKE_TOKEN: token }
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: "IMAGE_TRANSFORMATION_FAILED",
    })
  })
})
