import type { Db } from "@enterprise-agentic-saas/db"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { eq, inArray } from "drizzle-orm"
import { vi } from "vitest"

import { env } from "../../env"
import {
  AGENT_USAGE_HOUR_MS,
  createAgentInternalApi,
  issueAgentConnectionTicket,
} from "../agent/public"
import { createAuthorizationModule } from "../authorization/public"
import { pngBytes } from "./agent-assets.fixture-support"
import { agentAssetObjectKey } from "./constants"
import { detectImageFormat } from "./file-domain"
import { createFilesApplication } from "./module"
import { finalizePendingFile, reservePendingFile } from "./repository"
import {
  type FileCache,
  type FileImagesBinding,
  type FileR2Bucket,
  type FileR2Object,
  type FileR2PutValue,
  type FileStorageRuntime,
} from "./runtime"

export {
  createFixture,
  pngBytes,
  pngFile,
} from "./agent-assets.fixture-support"

const readBytes = async (value: FileR2PutValue) =>
  new Uint8Array(
    await (value instanceof Blob
      ? value.arrayBuffer()
      : new Response(value).arrayBuffer())
  )

type StoredObject = {
  bytes: Uint8Array<ArrayBuffer>
  object: FileR2Object
}

type ImagesInfoOverride = {
  fileSize?: number
  format?: string
  height?: number
  width?: number
}

export const createRuntime = () => {
  const objects = new Map<string, StoredObject>()
  const cachedResponses = new Map<string, Response>()
  const deletedKeys: string[] = []
  let etagSequence = 0
  let infoOverride: ImagesInfoOverride = {}
  let outputBytes: Uint8Array<ArrayBuffer> = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x57, 0x45,
  ])
  let outputContentType = "image/webp"
  let outputContentLength: string | null = null

  const head = vi.fn<FileR2Bucket["head"]>(
    async (key) => objects.get(key)?.object ?? null
  )
  const get = vi.fn<FileR2Bucket["get"]>(async (key) => {
    const stored = objects.get(key)
    if (!stored) return null
    return {
      ...stored.object,
      body: new Blob([Uint8Array.from(stored.bytes)]).stream(),
    }
  })
  const put = vi.fn<FileR2Bucket["put"]>(async (key, value, options) => {
    if (objects.has(key) && options.onlyIf?.get("if-none-match") === "*") {
      return null
    }
    const bytes = await readBytes(value)
    etagSequence += 1
    const object: FileR2Object = {
      key,
      size: bytes.byteLength,
      etag: `agent-etag-${etagSequence}`,
      httpEtag: `"agent-etag-${etagSequence}"`,
      customMetadata: { ...options.customMetadata },
    }
    objects.set(key, { bytes: Uint8Array.from(bytes), object })
    return object
  })
  const deleteObject = vi.fn<FileR2Bucket["delete"]>(async (keys) => {
    for (const key of typeof keys === "string" ? [keys] : keys) {
      deletedKeys.push(key)
      objects.delete(key)
    }
  })
  const list = vi.fn<FileR2Bucket["list"]>(async ({ prefix }) => ({
    objects: [...objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ key })),
    truncated: false,
  }))
  const bucket: FileR2Bucket = {
    head,
    get,
    put,
    delete: deleteObject,
    list,
  }

  type ImagesInput = ReturnType<FileImagesBinding["input"]>
  type ImagesTransform = ReturnType<ImagesInput["transform"]>
  const output = vi.fn<ImagesTransform["output"]>(async () => ({
    response: () => {
      const headers = new Headers({ "Content-Type": outputContentType })
      if (outputContentLength !== null) {
        headers.set("Content-Length", outputContentLength)
      }
      const source = outputBytes.slice()
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(source)
            controller.close()
          },
        }),
        { headers }
      )
    },
  }))
  const transform = vi.fn<ImagesInput["transform"]>(() => ({ output }))
  const input = vi.fn<FileImagesBinding["input"]>(() => ({ transform }))
  const info = vi.fn<FileImagesBinding["info"]>(async (stream) => {
    const bytes = await readBytes(stream)
    const detected = await detectImageFormat(new Blob([Uint8Array.from(bytes)]))
    return {
      fileSize: infoOverride.fileSize ?? bytes.byteLength,
      format: infoOverride.format ?? detected ?? "unknown",
      height: infoOverride.height ?? 360,
      width: infoOverride.width ?? 640,
    }
  })
  const images: FileImagesBinding = { info, input }
  const cacheMatch = vi.fn<FileCache["match"]>(async (request) =>
    cachedResponses.get(request.url)?.clone()
  )
  const cachePut = vi.fn<FileCache["put"]>(async (request, response) => {
    cachedResponses.set(request.url, response.clone())
  })
  const cache: FileCache = { match: cacheMatch, put: cachePut }
  const runtime: FileStorageRuntime = {
    agentAssetUploadEnabled: true,
    bucket,
    cache,
    images,
  }

  return {
    bucket,
    cache,
    cacheMatch,
    cachePut,
    deletedKeys,
    get,
    head,
    images: { info, input, output, transform },
    objects,
    put,
    runtime,
    setInfo(override: ImagesInfoOverride) {
      infoOverride = { ...override }
    },
    setOutput(options: {
      bytes: Uint8Array
      contentLength?: string | null
      contentType?: string
    }) {
      outputBytes = Uint8Array.from(options.bytes)
      outputContentLength = options.contentLength ?? null
      outputContentType = options.contentType ?? "image/webp"
    },
  }
}

const sessionHeaders = (
  input: {
    activeOrganizationId?: string
    sessionId?: string
    userId?: string
  } = {}
) =>
  new Headers({
    "x-test-user-id": input.userId ?? "asset-user-a",
    "x-test-session-id": input.sessionId ?? "asset-session-a",
    "x-test-active-organization-id":
      input.activeOrganizationId ?? "asset-org-a",
    "x-test-session-created-at": new Date().toISOString(),
    origin: env.CORS_ORIGIN[0] ?? env.API_PUBLIC_URL,
  })

export const uploadRequest = (input: {
  activeOrganizationId?: string
  file: File
  organizationId?: string
  sessionId?: string
  threadId?: string
  uploadId: string
  userId?: string
}) => {
  const body = new FormData()
  body.set("uploadId", input.uploadId)
  body.set("fileSize", String(input.file.size))
  body.set("file", input.file)
  return new Request(
    `http://localhost/files/organizations/${input.organizationId ?? "asset-org-a"}/agent-threads/${input.threadId ?? "asset-thread-a"}/assets`,
    {
      method: "POST",
      headers: sessionHeaders(input),
      body,
    }
  )
}

export const assetRequest = (input: {
  activeOrganizationId?: string
  assetId: string
  method?: "DELETE" | "GET"
  organizationId?: string
  sessionId?: string
  userId?: string
  ifNoneMatch?: string
}) => {
  const headers = sessionHeaders(input)
  if (input.ifNoneMatch) headers.set("if-none-match", input.ifNoneMatch)
  return new Request(
    `http://localhost/files/organizations/${input.organizationId ?? "asset-org-a"}/agent-assets/${input.assetId}${input.method === "DELETE" ? "" : "/preview/720"}`,
    {
      method: input.method ?? "GET",
      headers,
    }
  )
}

export const uploadDirect = (
  db: Db,
  file: File,
  uploadId: string,
  overrides: Partial<{
    actorUserId: string
    fileSize: number
    organizationId: string
    sessionId: string
    threadId: string
  }> = {}
) =>
  createFilesApplication(
    db,
    createAuthorizationModule(db).authorization
  ).uploadAgentAsset({
    actorUserId: overrides.actorUserId ?? "asset-user-a",
    file,
    fileSize: overrides.fileSize ?? file.size,
    organizationId: overrides.organizationId ?? "asset-org-a",
    sessionId: overrides.sessionId ?? "asset-session-a",
    threadId: overrides.threadId ?? "asset-thread-a",
    uploadId,
  })

export const reconcilePendingAgentAssetForTest = (
  db: Db,
  input: Parameters<
    ReturnType<typeof createFilesApplication>["reconcilePendingAgentAsset"]
  >[0]
) =>
  createFilesApplication(
    db,
    createAuthorizationModule(db).authorization
  ).reconcilePendingAgentAsset(input)

export const openConnection = async (db: Db) => {
  const ticket = await issueAgentConnectionTicket(db, {
    sessionId: "asset-session-a",
    threadId: "asset-thread-a",
    userId: "asset-user-a",
  })
  return (await createAgentInternalApi(db)).consumeConnectionTicket({
    ticket: ticket.ticket,
    threadId: "asset-thread-a",
  })
}

export const seedReadyAsset = async (
  db: Db,
  input: { id: string; sizeBytes: number }
) => {
  const now = new Date()
  const storageObjectId = `storage-${input.id}`
  const objectKey = agentAssetObjectKey({
    organizationId: "asset-org-a",
    storageObjectId,
  })
  await db.transaction(async (tx) => {
    await tx.insert(schema.storageObjects).values({
      id: storageObjectId,
      organizationId: "asset-org-a",
      uploaderId: "asset-user-a",
      uploadId: `upload-${input.id}`,
      objectKey,
      sizeBytes: input.sizeBytes,
      declaredContentType: "image/png",
      detectedImageFormat: "png",
      status: "pending",
      keyVersion: 2,
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(schema.agentAssets).values({
      id: input.id,
      organizationId: "asset-org-a",
      threadId: "asset-thread-a",
      sessionId: "asset-session-a",
      contextEpoch: 1,
      uploaderId: "asset-user-a",
      storageObjectId,
      filename: `${input.id}.png`,
      status: "pending",
      expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(schema.storageObjectClaims).values({
      storageObjectId,
      organizationId: "asset-org-a",
      holderType: "agent_asset",
      holderId: input.id,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await tx
      .update(schema.storageObjects)
      .set({
        imageWidth: 640,
        imageHeight: 360,
        etag: `etag-${input.id}`,
        status: "ready",
        updatedAt: now,
      })
      .where(eq(schema.storageObjects.id, storageObjectId))
    await tx
      .update(schema.agentAssets)
      .set({ status: "ready", updatedAt: now })
      .where(eq(schema.agentAssets.id, input.id))
  })
  return input.id
}

export const seedReadyAssetBatch = async (
  db: Db,
  input: { count: number; prefix: string }
) => {
  const now = new Date()
  const items = Array.from({ length: input.count }, (_, index) => {
    const assetId = `${input.prefix}-asset-${index}`
    const storageObjectId = `${input.prefix}-storage-${index}`
    return {
      assetId,
      storageObjectId,
      objectKey: agentAssetObjectKey({
        organizationId: "asset-org-a",
        storageObjectId,
      }),
    }
  })
  await db.transaction(async (tx) => {
    await tx.insert(schema.storageObjects).values(
      items.map(({ assetId, objectKey, storageObjectId }) => ({
        id: storageObjectId,
        organizationId: "asset-org-a",
        uploaderId: "asset-user-a",
        uploadId: `${input.prefix}-upload-${assetId}`,
        objectKey,
        sizeBytes: 1,
        declaredContentType: "image/png",
        detectedImageFormat: "png" as const,
        status: "pending" as const,
        keyVersion: 2 as const,
        createdAt: now,
        updatedAt: now,
      }))
    )
    await tx.insert(schema.agentAssets).values(
      items.map(({ assetId, storageObjectId }) => ({
        id: assetId,
        organizationId: "asset-org-a",
        threadId: "asset-thread-a",
        sessionId: "asset-session-a",
        contextEpoch: 1,
        uploaderId: "asset-user-a",
        storageObjectId,
        filename: `${assetId}.png`,
        status: "pending" as const,
        expiresAt: new Date(now.getTime() + 72 * AGENT_USAGE_HOUR_MS),
        createdAt: now,
        updatedAt: now,
      }))
    )
    await tx.insert(schema.storageObjectClaims).values(
      items.map(({ assetId, storageObjectId }) => ({
        storageObjectId,
        organizationId: "asset-org-a",
        holderType: "agent_asset" as const,
        holderId: assetId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }))
    )
    const storageObjectIds = items.map(({ storageObjectId }) => storageObjectId)
    const assetIds = items.map(({ assetId }) => assetId)
    await tx
      .update(schema.storageObjects)
      .set({
        imageWidth: 1,
        imageHeight: 1,
        etag: `${input.prefix}-etag`,
        status: "ready",
        updatedAt: now,
      })
      .where(inArray(schema.storageObjects.id, storageObjectIds))
    await tx
      .update(schema.agentAssets)
      .set({ status: "ready", updatedAt: now })
      .where(inArray(schema.agentAssets.id, assetIds))
  })
}

export const seedReadyIssueAttachment = async (
  db: Db,
  storage: ReturnType<typeof createRuntime>,
  input: {
    detectedImageFormat: "jpeg" | "png" | "webp" | "gif" | "avif" | null
    fileId: string
    issueId: string
    organizationId?: string
  }
) => {
  const organizationId = input.organizationId ?? "asset-org-a"
  const objectKey = `private/${organizationId}/files/${input.fileId}`
  const bytes = pngBytes()
  const reserved = await reservePendingFile(db, {
    declaredContentType:
      input.detectedImageFormat === null
        ? "application/pdf"
        : `image/${input.detectedImageFormat}`,
    detectedImageFormat: input.detectedImageFormat,
    fileId: input.fileId,
    filename:
      input.detectedImageFormat === null
        ? `${input.fileId}.pdf`
        : `${input.fileId}.${input.detectedImageFormat}`,
    objectKey,
    organizationId,
    ownerId: input.issueId,
    ownerType: "issue",
    sizeBytes: bytes.byteLength,
    uploaderId: "asset-user-a",
    uploadId: `upload-${input.fileId}`,
  })
  const object = await storage.runtime.bucket.put(
    objectKey,
    new Blob([bytes]),
    {
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: {
        expectedSize: String(bytes.byteLength),
        fileId: input.fileId,
        uploadId: `upload-${input.fileId}`,
      },
    }
  )
  if (!object) throw new Error("Issue attachment fixture upload failed")
  await finalizePendingFile(db, {
    actorUserId: "asset-user-a",
    etag: object.etag,
    file: reserved.file,
    imageHeight: input.detectedImageFormat === null ? null : 360,
    imageWidth: input.detectedImageFormat === null ? null : 640,
  })
}
