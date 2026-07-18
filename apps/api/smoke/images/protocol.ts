import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto"

export const IMAGES_SMOKE_ROUTE = "/transform" as const
export const IMAGES_SMOKE_HEALTH_ROUTE = "/health" as const
export const IMAGES_SMOKE_WIDTH = 360 as const
export const IMAGES_SMOKE_MAX_INPUT_BYTES = 20_000_000 as const
export const IMAGES_SMOKE_MAX_OUTPUT_BYTES = 1_000_000 as const

export const IMAGES_SMOKE_TRANSFORM = {
  width: IMAGES_SMOKE_WIDTH,
  fit: "scale-down",
} as const

export const IMAGES_SMOKE_OUTPUT = {
  format: "image/webp",
  quality: 75,
  anim: false,
} as const

export const IMAGES_SMOKE_INPUT_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

const encoder = new TextEncoder()

type TimingSafeSubtleCrypto = SubtleCrypto & {
  timingSafeEqual(
    provided: ArrayBufferView<ArrayBuffer>,
    expected: ArrayBufferView<ArrayBuffer>
  ): boolean
}

const hasTimingSafeEqual = (
  subtle: SubtleCrypto
): subtle is TimingSafeSubtleCrypto =>
  "timingSafeEqual" in subtle && typeof subtle.timingSafeEqual === "function"

export const readBearerToken = (
  authorization: string | null
): string | null => {
  if (!authorization?.startsWith("Bearer ")) return null

  const token = authorization.slice("Bearer ".length)
  return token.length > 0 && token.trim() === token ? token : null
}

export const verifySmokeToken = async (
  providedToken: string | null,
  expectedToken: string
): Promise<boolean> => {
  if (!providedToken || expectedToken.length < 32) return false

  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(providedToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),
  ])
  const provided = new Uint8Array(providedDigest)
  const expected = new Uint8Array(expectedDigest)
  return hasTimingSafeEqual(crypto.subtle)
    ? crypto.subtle.timingSafeEqual(provided, expected)
    : nodeTimingSafeEqual(provided, expected)
}

export type WebpDimensions = {
  width: number
  height: number
}

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  new TextDecoder("ascii").decode(bytes.subarray(offset, offset + length))

const byteAt = (bytes: Uint8Array, offset: number) => bytes[offset] ?? 0

const littleEndian24 = (bytes: Uint8Array, offset: number) =>
  byteAt(bytes, offset) |
  (byteAt(bytes, offset + 1) << 8) |
  (byteAt(bytes, offset + 2) << 16)

export const readWebpDimensions = (
  bytes: Uint8Array
): WebpDimensions | null => {
  if (
    bytes.byteLength < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP"
  ) {
    return null
  }

  let chunkOffset = 12
  while (chunkOffset + 8 <= bytes.byteLength) {
    const chunkType = ascii(bytes, chunkOffset, 4)
    const chunkLength =
      byteAt(bytes, chunkOffset + 4) |
      (byteAt(bytes, chunkOffset + 5) << 8) |
      (byteAt(bytes, chunkOffset + 6) << 16) |
      (byteAt(bytes, chunkOffset + 7) << 24)
    const payloadOffset = chunkOffset + 8

    if (chunkLength < 0 || payloadOffset + chunkLength > bytes.byteLength) {
      return null
    }

    if (
      chunkType === "VP8 " &&
      chunkLength >= 10 &&
      bytes[payloadOffset + 3] === 0x9d &&
      bytes[payloadOffset + 4] === 0x01 &&
      bytes[payloadOffset + 5] === 0x2a
    ) {
      return {
        width:
          (byteAt(bytes, payloadOffset + 6) |
            (byteAt(bytes, payloadOffset + 7) << 8)) &
          0x3fff,
        height:
          (byteAt(bytes, payloadOffset + 8) |
            (byteAt(bytes, payloadOffset + 9) << 8)) &
          0x3fff,
      }
    }

    if (
      chunkType === "VP8L" &&
      chunkLength >= 5 &&
      bytes[payloadOffset] === 0x2f
    ) {
      const bits =
        byteAt(bytes, payloadOffset + 1) |
        (byteAt(bytes, payloadOffset + 2) << 8) |
        (byteAt(bytes, payloadOffset + 3) << 16) |
        (byteAt(bytes, payloadOffset + 4) << 24)
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      }
    }

    if (chunkType === "VP8X" && chunkLength >= 10) {
      return {
        width: littleEndian24(bytes, payloadOffset + 4) + 1,
        height: littleEndian24(bytes, payloadOffset + 7) + 1,
      }
    }

    chunkOffset = payloadOffset + chunkLength + (chunkLength % 2)
  }

  return null
}

export const readBoundedResponse = async (
  response: Response,
  maximumBytes: number = IMAGES_SMOKE_MAX_OUTPUT_BYTES
): Promise<Uint8Array> => {
  if (!response.body) throw new Error("IMAGES_SMOKE_EMPTY_RESPONSE")

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- response streamはchunkごとに逐次読む必要がある。
      const result = await reader.read()
      if (result.done) break

      totalBytes += result.value.byteLength
      if (totalBytes > maximumBytes) {
        // oxlint-disable-next-line no-await-in-loop -- 上限超過時は次chunkを読む前にstreamを停止する。
        await reader.cancel("images smoke output exceeded its fixed limit")
        throw new Error("IMAGES_SMOKE_OUTPUT_TOO_LARGE")
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const output = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export const isAllowedImagesSmokeUrl = (url: URL): boolean =>
  (url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost")) ||
  (url.protocol === "https:" && url.hostname.endsWith(".workers.dev"))
