import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import {
  IMAGES_SMOKE_OUTPUT,
  IMAGES_SMOKE_TRANSFORM,
  isAllowedImagesSmokeUrl,
  readBearerToken,
  readBoundedResponse,
  readWebpDimensions,
  verifySmokeToken,
} from "./protocol"

describe("Images remote smoke protocol", () => {
  it("uses the production preview transform contract", () => {
    expect(IMAGES_SMOKE_TRANSFORM).toEqual({
      width: 360,
      fit: "scale-down",
    })
    expect(IMAGES_SMOKE_OUTPUT).toEqual({
      format: "image/webp",
      quality: 75,
      anim: false,
    })
  })

  it("parses and verifies a bearer token without direct comparison", async () => {
    const expected = "a".repeat(64)
    expect(readBearerToken(`Bearer ${expected}`)).toBe(expected)
    expect(readBearerToken(`Bearer ${expected} `)).toBeNull()
    await expect(verifySmokeToken(expected, expected)).resolves.toBe(true)
    await expect(verifySmokeToken("b".repeat(64), expected)).resolves.toBe(
      false
    )
  })

  it("reads the dimensions from the committed WebP fixture", async () => {
    const fixture = await readFile(
      new URL(
        "../../../../packages/db/fixtures/files/preview.webp",
        import.meta.url
      )
    )
    expect(readWebpDimensions(fixture)).toEqual({
      width: 360,
      height: 240,
    })
  })

  it("rejects non-WebP bytes and oversized streamed output", async () => {
    expect(readWebpDimensions(new Uint8Array(30))).toBeNull()
    const response = new Response(new Uint8Array(5))
    await expect(readBoundedResponse(response, 4)).rejects.toThrow(
      "IMAGES_SMOKE_OUTPUT_TOO_LARGE"
    )
  })

  it("only sends the credential to loopback or workers.dev", () => {
    expect(
      isAllowedImagesSmokeUrl(new URL("http://127.0.0.1:8791/transform"))
    ).toBe(true)
    expect(
      isAllowedImagesSmokeUrl(
        new URL("https://preview.example.workers.dev/transform")
      )
    ).toBe(true)
    expect(
      isAllowedImagesSmokeUrl(new URL("https://example.com/transform"))
    ).toBe(false)
    expect(
      isAllowedImagesSmokeUrl(new URL("http://example.workers.dev/transform"))
    ).toBe(false)
  })
})
