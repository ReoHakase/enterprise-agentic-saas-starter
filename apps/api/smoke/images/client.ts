import {
  developmentFileFixtures,
  getDevelopmentFileFixtureUrl,
} from "@enterprise-agentic-saas/db/development-seed"

import {
  IMAGES_SMOKE_MAX_OUTPUT_BYTES,
  IMAGES_SMOKE_ROUTE,
  IMAGES_SMOKE_WIDTH,
  isAllowedImagesSmokeUrl,
  readBoundedResponse,
  readWebpDimensions,
} from "./protocol"

type ImagesSmokeResult = {
  status: "passed"
  format: "image/webp"
  width: number
  height: number
  sizeBytes: number
}

const fixture = developmentFileFixtures.find(
  (candidate) => candidate.key === "png"
)
if (!fixture) throw new Error("IMAGES_SMOKE_FIXTURE_NOT_FOUND")

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

const loadFixture = async (): Promise<Bun.BunFile> => {
  const file = Bun.file(getDevelopmentFileFixtureUrl(fixture))
  if (file.size !== fixture.sizeBytes) {
    throw new Error("IMAGES_SMOKE_FIXTURE_SIZE_MISMATCH")
  }

  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  )
  if (hex(digest) !== fixture.sha256) {
    throw new Error("IMAGES_SMOKE_FIXTURE_DIGEST_MISMATCH")
  }
  return file
}

export const runImagesSmokeClient = async (
  baseUrl: string,
  token: string
): Promise<ImagesSmokeResult> => {
  if (token.length < 32) throw new Error("IMAGES_SMOKE_TOKEN_TOO_SHORT")

  const url = new URL(IMAGES_SMOKE_ROUTE, baseUrl)
  if (!isAllowedImagesSmokeUrl(url)) {
    throw new Error("IMAGES_SMOKE_URL_NOT_ALLOWED")
  }

  const input = await loadFixture()
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": fixture.declaredContentType,
    },
    body: input,
  })

  if (response.status !== 200) {
    await response.body?.cancel()
    throw new Error(`IMAGES_SMOKE_HTTP_${response.status}`)
  }
  if (response.headers.get("Content-Type")?.split(";", 1)[0] !== "image/webp") {
    await response.body?.cancel()
    throw new Error("IMAGES_SMOKE_CONTENT_TYPE_MISMATCH")
  }

  const output = await readBoundedResponse(
    response,
    IMAGES_SMOKE_MAX_OUTPUT_BYTES
  )
  const dimensions = readWebpDimensions(output)
  const sourceWidth = fixture.expectedImageWidth
  const sourceHeight = fixture.expectedImageHeight
  if (sourceWidth === null || sourceHeight === null) {
    throw new Error("IMAGES_SMOKE_FIXTURE_DIMENSIONS_MISSING")
  }
  const expectedHeight = Math.round(
    (sourceHeight / sourceWidth) * IMAGES_SMOKE_WIDTH
  )
  if (
    !dimensions ||
    dimensions.width !== IMAGES_SMOKE_WIDTH ||
    dimensions.height !== expectedHeight
  ) {
    throw new Error("IMAGES_SMOKE_DIMENSIONS_MISMATCH")
  }

  return {
    status: "passed",
    format: "image/webp",
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: output.byteLength,
  }
}

if (import.meta.main) {
  const baseUrl = process.env.IMAGES_SMOKE_URL
  const token = process.env.SMOKE_TOKEN
  if (!baseUrl || !token) throw new Error("IMAGES_SMOKE_ENV_MISSING")

  const result = await runImagesSmokeClient(baseUrl, token)
  console.log(JSON.stringify({ event: "images_smoke_passed", ...result }))
}
