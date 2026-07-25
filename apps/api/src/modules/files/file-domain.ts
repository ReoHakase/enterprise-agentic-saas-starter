import type { FileOwnerType, PreviewableImageFormat } from "./constants"

export type DetectedImageFormat = PreviewableImageFormat | "avif" | null

export type FileWithOwner = {
  createdAt: Date
  declaredContentType: string
  detectedImageFormat: DetectedImageFormat
  etag: null | string
  filename: string
  id: string
  imageHeight: null | number
  imageWidth: null | number
  keyVersion: 1 | 2 | null
  objectKey: string
  organizationId: string
  ownerId: string
  ownerType: FileOwnerType
  sizeBytes: number
  status: "pending" | "ready"
  storageObjectId: null | string
  updatedAt: Date
  uploaderId: string
  uploadId: string
}

const startsWith = (bytes: Uint8Array, expected: readonly number[]) =>
  expected.every((byte, index) => bytes[index] === byte)

export const detectImageFormat = async (
  file: Blob
): Promise<DetectedImageFormat> => {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg"
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png"
  }
  const ascii = new TextDecoder("ascii").decode(bytes)
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "gif"
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp"
  if (
    ascii.slice(4, 8) === "ftyp" &&
    (ascii.slice(8, 12) === "avif" || ascii.slice(8, 12) === "avis")
  ) {
    return "avif"
  }
  return null
}
