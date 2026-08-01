import { HttpError } from "../../errors/http-error"
import {
  type FileR2Object,
  type FileR2ObjectBody,
  type FileStorageRuntime,
} from "../files/public"
import {
  PROFILE_IMAGE_OUTPUT_CONTENT_TYPE,
  PROFILE_IMAGE_OUTPUT_MAX_BYTES,
  PROFILE_IMAGE_OUTPUT_QUALITY,
  PROFILE_IMAGE_SIZE,
  PROFILE_IMAGE_SOURCE_CONTENT_TYPE,
  PROFILE_IMAGE_SOURCE_MAX_BYTES,
  profileImageObjectKey,
  profileImagePath,
  type ProfileImageSubject,
} from "./constants"
import type { ProfileImageDto } from "./model"
import type { ProfileImagePorts, StoredProfileImage } from "./ports"

const providerUnavailable = (
  _provider: "images" | "r2" | "runtime",
  _operation: string,
  cause?: unknown
) =>
  new HttpError({
    cause,
    code: "service_unavailable",
    retryAfter: 30,
  })

const bodyObject = (
  object: FileR2Object | FileR2ObjectBody | null
): FileR2ObjectBody | null =>
  object && "body" in object && object.body instanceof ReadableStream
    ? object
    : null

const httpEtag = (etag: string) =>
  etag.startsWith('"') && etag.endsWith('"') ? etag : `"${etag}"`

const matchesIfNoneMatch = (value: string | null, etag: string) =>
  value
    ?.split(",")
    .map((candidate) => candidate.trim().replace(/^W\//u, ""))
    .some((candidate) => candidate === "*" || candidate === etag) ?? false

const privateProfileImageHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-cache",
    "Content-Type": PROFILE_IMAGE_OUTPUT_CONTENT_TYPE,
    "Cross-Origin-Resource-Policy": "same-site",
    "X-Content-Type-Options": "nosniff",
  })

const sourceHash = async (file: Blob) => {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

const readTransformedProfileImage = async (
  body: ReadableStream<Uint8Array>
): Promise<Blob> => {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Images responseを固定上限内で逐次読む。
      const result = await reader.read()
      if (result.done) break
      if (
        byteLength + result.value.byteLength >
        PROFILE_IMAGE_OUTPUT_MAX_BYTES
      ) {
        throw providerUnavailable("images", "validateTransformedProfileImage")
      }
      chunks.push(result.value)
      byteLength += result.value.byteLength
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }

  if (byteLength < 1) {
    throw providerUnavailable("images", "validateTransformedProfileImage")
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Blob([bytes], { type: PROFILE_IMAGE_OUTPUT_CONTENT_TYPE })
}

const hasPngMagicBytes = async (file: Blob) => {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const expected = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return expected.every((byte, index) => bytes[index] === byte)
}

const normalizeImagesFormat = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^image\//u, "")

const validateSource = async (
  runtime: FileStorageRuntime,
  file: File,
  declaredSize: number
) => {
  if (
    declaredSize !== file.size ||
    file.size < 1 ||
    file.size > PROFILE_IMAGE_SOURCE_MAX_BYTES
  ) {
    throw new HttpError({ code: "validation_error" })
  }
  if (
    file.type.trim().toLowerCase() !== PROFILE_IMAGE_SOURCE_CONTENT_TYPE ||
    !(await hasPngMagicBytes(file))
  ) {
    throw new HttpError({ code: "validation_error" })
  }

  let info: Awaited<ReturnType<FileStorageRuntime["images"]["info"]>>
  try {
    info = await runtime.images.info(file.stream())
  } catch (cause) {
    throw providerUnavailable("images", "readSourceInfo", cause)
  }
  if (
    normalizeImagesFormat(info.format) !== "png" ||
    info.width !== PROFILE_IMAGE_SIZE ||
    info.height !== PROFILE_IMAGE_SIZE ||
    (info.fileSize !== undefined && info.fileSize !== file.size)
  ) {
    throw new HttpError({ code: "validation_error" })
  }
}

const metadataMatches = (object: FileR2Object, image: StoredProfileImage) => {
  const metadata = object.customMetadata
  if (!metadata) return false
  const keys = Object.keys(metadata).toSorted()
  return (
    keys.length === 3 &&
    keys[0] === "profileImageId" &&
    keys[1] === "sourceHash" &&
    keys[2] === "uploadId" &&
    object.key === image.objectKey &&
    (image.etag === null || object.etag === image.etag) &&
    metadata.profileImageId === image.id &&
    metadata.sourceHash === image.sourceHash &&
    metadata.uploadId === image.uploadId
  )
}

const toDto = (
  image: StoredProfileImage,
  subject: ProfileImageSubject
): ProfileImageDto => ({
  id: image.id,
  profileImage: profileImagePath(subject, image.id),
  width: PROFILE_IMAGE_SIZE,
  height: PROFILE_IMAGE_SIZE,
  updatedAt: image.updatedAt.toISOString(),
})

const transformAndStore = async (
  runtime: FileStorageRuntime,
  image: StoredProfileImage,
  file: File
) => {
  let object: FileR2Object | null
  try {
    object = await runtime.bucket.head(image.objectKey)
  } catch (cause) {
    throw providerUnavailable("r2", "headProfileImageObject", cause)
  }
  if (!object) {
    let transformedImage: Blob
    try {
      const transformed = await runtime.images
        .input(file.stream())
        .transform({
          width: PROFILE_IMAGE_SIZE,
          height: PROFILE_IMAGE_SIZE,
          fit: "cover",
        })
        .output({
          format: PROFILE_IMAGE_OUTPUT_CONTENT_TYPE,
          quality: PROFILE_IMAGE_OUTPUT_QUALITY,
          anim: false,
        })
      const response = transformed.response()
      if (!response.ok || !response.body) {
        throw providerUnavailable("images", "transformProfileImage")
      }
      const contentType =
        response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? ""
      if (contentType !== PROFILE_IMAGE_OUTPUT_CONTENT_TYPE) {
        throw providerUnavailable("images", "validateTransformedProfileImage")
      }
      transformedImage = await readTransformedProfileImage(response.body)
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw providerUnavailable("images", "transformProfileImage", error)
    }

    try {
      object = await runtime.bucket.put(image.objectKey, transformedImage, {
        onlyIf: new Headers({ "if-none-match": "*" }),
        httpMetadata: { contentType: PROFILE_IMAGE_OUTPUT_CONTENT_TYPE },
        customMetadata: {
          profileImageId: image.id,
          uploadId: image.uploadId,
          sourceHash: image.sourceHash,
        },
      })
      object ??= await runtime.bucket.head(image.objectKey)
    } catch (cause) {
      throw providerUnavailable("r2", "storeProfileImage", cause)
    }
  }
  if (
    !object ||
    !metadataMatches(object, image) ||
    object.size < 1 ||
    object.size > PROFILE_IMAGE_OUTPUT_MAX_BYTES ||
    typeof object.etag !== "string" ||
    object.etag.length < 1 ||
    object.etag.length > 128
  ) {
    throw providerUnavailable("r2", "verifyProfileImageObject")
  }
  return object
}

export const createProfileImageService = (ports: ProfileImagePorts) => {
  const getRuntime = () => {
    try {
      return ports.getRuntime()
    } catch (cause) {
      throw providerUnavailable("runtime", "getFileStorageRuntime", cause)
    }
  }

  const uploadProfileImage = async (input: {
    actorUserId: string
    file: File
    fileSize: number
    sessionId?: string
    subject: ProfileImageSubject
    uploadId: string
  }): Promise<{ created: boolean; dto: ProfileImageDto }> => {
    const runtime = getRuntime()
    await validateSource(runtime, input.file, input.fileSize)
    const hash = await sourceHash(input.file)
    const id = crypto.randomUUID()
    const reservation = await ports.reservePendingProfileImage({
      id,
      objectKey: profileImageObjectKey({ id, subject: input.subject }),
      sourceHash: hash,
      subject: input.subject,
      uploadId: input.uploadId,
    })
    if (reservation.image.sourceHash !== hash) {
      throw new HttpError({ code: "conflict" })
    }

    if (reservation.image.status === "superseded") {
      throw new HttpError({ code: "conflict" })
    }

    if (reservation.image.status === "ready") {
      let object: FileR2Object | null
      try {
        object = await runtime.bucket.head(reservation.image.objectKey)
      } catch (cause) {
        throw providerUnavailable("r2", "headProfileImageRetry", cause)
      }
      if (!object || !metadataMatches(object, reservation.image)) {
        throw providerUnavailable("r2", "verifyProfileImageRetry")
      }
      return {
        created: false,
        dto: toDto(reservation.image, input.subject),
      }
    }

    const object = await transformAndStore(
      runtime,
      reservation.image,
      input.file
    )
    let finalized: Awaited<
      ReturnType<ProfileImagePorts["finalizePendingProfileImage"]>
    >
    try {
      finalized = await ports.finalizePendingProfileImage({
        actorUserId: input.actorUserId,
        etag: object.etag,
        id: reservation.image.id,
        profileImagePath: profileImagePath(input.subject, reservation.image.id),
        sessionId: input.sessionId,
        subject: input.subject,
      })
    } catch (cause) {
      await ports.supersedePendingProfileImage(reservation.image)
      throw cause
    }
    if (finalized.kind !== "ready") {
      await ports.supersedePendingProfileImage(reservation.image)
      throw new HttpError({ code: "conflict" })
    }
    return {
      created: reservation.created,
      dto: toDto(finalized.image, input.subject),
    }
  }

  const readProfileImage = async (input: {
    request: Request
    subject: ProfileImageSubject
  }): Promise<Response> => {
    const image = await ports.findReadyProfileImage(input.subject)
    if (!image || !image.etag) {
      throw new HttpError({ code: "not_found" })
    }
    const etag = httpEtag(image.etag)
    const headers = privateProfileImageHeaders()
    headers.set("ETag", etag)
    if (matchesIfNoneMatch(input.request.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers })
    }

    const runtime = getRuntime()
    let source: FileR2ObjectBody | null
    try {
      source = bodyObject(
        await runtime.bucket.get(image.objectKey, {
          onlyIf: new Headers({ "if-match": etag }),
        })
      )
    } catch (cause) {
      throw providerUnavailable("r2", "readProfileImage", cause)
    }
    if (!source || !metadataMatches(source, image)) {
      throw providerUnavailable("r2", "readProfileImage")
    }
    headers.set("Content-Length", String(source.size))
    return new Response(source.body, { status: 200, headers })
  }

  const removeProfileImage = async (input: {
    actorUserId: string
    sessionId?: string
    subject: ProfileImageSubject
  }) => {
    const removed = await ports.deleteProfileImage(input)
    if (!removed) {
      throw new HttpError({ code: "not_found" })
    }
  }

  return { readProfileImage, removeProfileImage, uploadProfileImage }
}

export type ProfileImageService = ReturnType<typeof createProfileImageService>
