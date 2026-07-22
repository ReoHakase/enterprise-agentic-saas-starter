import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Db } from "@enterprise-agentic-saas/db"
import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { eq, inArray, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import * as v from "valibot"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createApp } from "../../app"
import { env } from "../../env"
import { createAgentInternalApi } from "../agent/internal-api"
import { issueAgentConnectionTicket, startAgentRun } from "../agent/repository"
import {
  AGENT_RESOURCE_USAGE_RETENTION_GRACE_MS,
  AGENT_USAGE_DAY_MS,
  AGENT_USAGE_HOUR_MS,
  consumeAgentResourceLimitInTransaction,
  utcUsageWindow,
} from "../agent/resource-usage-repository"
import {
  processAgentAssetLifecycle,
  processStorageObjectCleanupJobs,
} from "./agent-assets-cleanup"
import {
  finalizePendingAgentAsset,
  promoteAgentAssetToIssueFileInTransaction,
  reservePendingAgentAsset,
  type AgentAssetWithStorage,
} from "./agent-assets-repository"
import {
  reconcilePendingAgentAsset,
  uploadAgentAsset,
} from "./agent-assets-service"
import {
  AGENT_ASSET_MAX_BYTES,
  AGENT_ASSET_MAX_DIMENSION,
  AGENT_ASSET_MAX_READY_PER_ORGANIZATION,
  AGENT_ASSET_MODEL_MAX_BYTES,
  AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT,
  ORGANIZATION_FILE_QUOTA_BYTES,
  agentAssetObjectKey,
} from "./constants"
import { agentAssetDtoModel } from "./model"
import {
  configureFileStorageRuntime,
  resetFileStorageRuntimeForTest,
  type FileCache,
  type FileImagesBinding,
  type FileR2Bucket,
  type FileR2Object,
  type FileR2PutValue,
  type FileStorageRuntime,
} from "./runtime"
import { detectImageFormat } from "./service"

const migrationsFolder = new URL(
  "../../../../../packages/db/drizzle",
  import.meta.url
).pathname

const clients: Array<ReturnType<typeof createClient>> = []
const databasePaths: string[] = []

afterEach(async () => {
  resetFileStorageRuntimeForTest()
  for (const client of clients.splice(0)) client.close()
  await Promise.all(
    databasePaths.splice(0).map((path) => rm(path, { force: true }))
  )
})

const createFixture = async () => {
  const databasePath = join(
    tmpdir(),
    `enterprise-agent-assets-${crypto.randomUUID()}.db`
  )
  databasePaths.push(databasePath)
  const client = createClient({ url: `file:${databasePath}` })
  clients.push(client)
  const db: Db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  await db.insert(schema.user).values([
    {
      id: "asset-user-a",
      name: "Asset User A",
      email: "asset-a@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "asset-user-b",
      name: "Asset User B",
      email: "asset-b@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(schema.organization).values([
    {
      id: "asset-org-a",
      name: "Asset Org A",
      slug: "asset-org-a",
      createdAt: now,
    },
    {
      id: "asset-org-b",
      name: "Asset Org B",
      slug: "asset-org-b",
      createdAt: now,
    },
  ])
  await db.insert(schema.member).values([
    {
      id: "asset-member-a-a",
      organizationId: "asset-org-a",
      userId: "asset-user-a",
      role: "super_admin",
      createdAt: now,
    },
    {
      id: "asset-member-a-b",
      organizationId: "asset-org-a",
      userId: "asset-user-b",
      role: "member",
      createdAt: now,
    },
    {
      id: "asset-member-b-a",
      organizationId: "asset-org-b",
      userId: "asset-user-a",
      role: "super_admin",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values([
    {
      id: "asset-session-a",
      userId: "asset-user-a",
      token: "asset-token-a",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "asset-org-a",
    },
    {
      id: "asset-session-b",
      userId: "asset-user-b",
      token: "asset-token-b",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "asset-org-a",
    },
    {
      id: "asset-session-a-org-b",
      userId: "asset-user-a",
      token: "asset-token-a-org-b",
      expiresAt,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: "asset-org-b",
    },
  ])
  await db.insert(schema.agentThreads).values([
    {
      id: "asset-thread-a",
      organizationId: "asset-org-a",
      ownerUserId: "asset-user-a",
      title: "Asset thread A",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "asset-thread-other-owner",
      organizationId: "asset-org-a",
      ownerUserId: "asset-user-b",
      title: "Other owner thread",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "asset-thread-b",
      organizationId: "asset-org-b",
      ownerUserId: "asset-user-a",
      title: "Asset thread B",
      createdAt: now,
      updatedAt: now,
    },
  ])

  return { app: createApp(db), db, now }
}

const pngSignature = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

const pngBytes = (size = 16, variant = 0) => {
  const bytes = new Uint8Array(size)
  bytes.set(pngSignature)
  bytes[bytes.byteLength - 1] = variant
  return bytes
}

const pngFile = (
  name = "agent-image.png",
  options: { size?: number; type?: string; variant?: number } = {}
) =>
  new File([pngBytes(options.size, options.variant)], name, {
    type: options.type ?? "image/png",
  })

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

const createRuntime = () => {
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

const uploadRequest = (input: {
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

const assetRequest = (input: {
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

const uploadDirect = (
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
  uploadAgentAsset(db, {
    actorUserId: overrides.actorUserId ?? "asset-user-a",
    file,
    fileSize: overrides.fileSize ?? file.size,
    organizationId: overrides.organizationId ?? "asset-org-a",
    sessionId: overrides.sessionId ?? "asset-session-a",
    threadId: overrides.threadId ?? "asset-thread-a",
    uploadId,
  })

const openConnection = async (db: Db) => {
  const ticket = await issueAgentConnectionTicket(db, {
    sessionId: "asset-session-a",
    threadId: "asset-thread-a",
    userId: "asset-user-a",
  })
  return createAgentInternalApi(db).consumeConnectionTicket({
    ticket: ticket.ticket,
    threadId: "asset-thread-a",
  })
}

const seedReadyAsset = async (
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

const seedReadyAssetBatch = async (
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

describe("Agent staged image API and lifecycle", () => {
  it("uploads one private Standard object and returns only an opaque DTO", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const file = pngFile()

    const response = await app.handle(
      uploadRequest({ file, uploadId: "agent-upload-success" })
    )
    expect(response.status).toBe(201)
    const dto = v.parse(agentAssetDtoModel, await response.json())
    expect(Object.keys(dto).toSorted()).toEqual(
      [
        "expiresAt",
        "filename",
        "id",
        "imageHeight",
        "imageWidth",
        "previewable",
        "sizeBytes",
      ].toSorted()
    )
    expect(dto).toMatchObject({
      filename: "agent-image.png",
      imageHeight: 360,
      imageWidth: 640,
      previewable: true,
      sizeBytes: file.size,
    })
    expect(dto.id).toMatch(/^[0-9a-f-]{36}$/u)
    expect(JSON.stringify(dto)).not.toContain("organizations/")
    expect(JSON.stringify(dto)).not.toContain("objectKey")

    expect(storage.put).toHaveBeenCalledTimes(1)
    const [key, , options] = storage.put.mock.calls[0] ?? []
    expect(key).toMatch(
      /^organizations\/asset-org-a\/storage-objects\/[0-9a-f-]{36}$/u
    )
    expect(options).toMatchObject({
      httpMetadata: { contentType: "application/octet-stream" },
      storageClass: "Standard",
    })
    expect(options?.onlyIf?.get("if-none-match")).toBe("*")
    expect(Object.keys(options?.customMetadata ?? {}).toSorted()).toEqual([
      "agentAssetId",
      "expectedSize",
      "storageObjectId",
      "uploadId",
    ])
    expect(options?.customMetadata).toMatchObject({
      expectedSize: String(file.size),
      uploadId: "agent-upload-success",
    })

    const [asset] = await db.select().from(schema.agentAssets)
    const [object] = await db.select().from(schema.storageObjects)
    const [claim] = await db.select().from(schema.storageObjectClaims)
    const [usage] = await db.select().from(schema.organizationFileUsage)
    expect(asset).toMatchObject({
      id: dto.id,
      organizationId: "asset-org-a",
      sessionId: "asset-session-a",
      status: "ready",
      threadId: "asset-thread-a",
      uploaderId: "asset-user-a",
    })
    expect(object).toMatchObject({
      id: asset?.storageObjectId,
      keyVersion: 2,
      status: "ready",
    })
    expect(claim).toMatchObject({
      holderId: dto.id,
      holderType: "agent_asset",
      storageObjectId: object?.id,
    })
    expect(usage).toMatchObject({
      organizationId: "asset-org-a",
      temporaryBytes: file.size,
      usedBytes: file.size,
    })
  })

  it("fails closed before DB or R2 work when Agent asset upload is not explicitly enabled", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime({
      ...storage.runtime,
      agentAssetUploadEnabled: undefined,
    })

    const response = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "disabled-upload" })
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: {
        code: "service_unavailable",
        context: {
          reason: "feature_disabled",
          resource: "agent_asset",
        },
      },
    })
    expect(storage.head).not.toHaveBeenCalled()
    expect(storage.put).not.toHaveBeenCalled()
    expect(await db.select().from(schema.agentAssets)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([])
    expect(await db.select().from(schema.agentResourceUsageBuckets)).toEqual([])
  })

  it("authorizes before serving a private preview cache and supports ETag revalidation", async () => {
    const { app } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "preview-cache" })
    )
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id

    const first = await app.handle(assetRequest({ assetId }))
    expect(first.status).toBe(200)
    expect(first.headers.get("cache-control")).toBe("private, no-cache")
    expect(first.headers.get("content-type")).toBe("image/webp")
    const etag = first.headers.get("etag")
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/u)
    if (!etag) throw new Error("Preview ETag is missing")
    expect(storage.cacheMatch).toHaveBeenCalledTimes(1)
    expect(storage.cachePut).toHaveBeenCalledTimes(1)
    expect(storage.images.input).toHaveBeenCalledTimes(1)

    const cached = await app.handle(assetRequest({ assetId }))
    expect(cached.status).toBe(200)
    expect(cached.headers.get("etag")).toBe(etag)
    expect(storage.cacheMatch).toHaveBeenCalledTimes(2)
    expect(storage.cachePut).toHaveBeenCalledTimes(1)
    expect(storage.images.input).toHaveBeenCalledTimes(1)

    const revalidated = await app.handle(
      assetRequest({ assetId, ifNoneMatch: etag })
    )
    expect(revalidated.status).toBe(304)
    expect(storage.cacheMatch).toHaveBeenCalledTimes(2)

    const unauthorized = await app.handle(
      assetRequest({
        assetId,
        sessionId: "asset-session-b",
        userId: "asset-user-b",
      })
    )
    expect(unauthorized.status).toBe(404)
    expect(storage.cacheMatch).toHaveBeenCalledTimes(2)
  })

  it("converges an identical upload retry and conflicts changed bytes", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    const first = await app.handle(
      uploadRequest({
        file: pngFile("retry.png", { variant: 1 }),
        uploadId: "agent-upload-retry",
      })
    )
    expect(first.status).toBe(201)
    const firstDto = await first.json()

    const retry = await app.handle(
      uploadRequest({
        file: pngFile("retry.png", { variant: 1 }),
        uploadId: "agent-upload-retry",
      })
    )
    expect(retry.status).toBe(200)
    expect(await retry.json()).toEqual(firstDto)
    expect(storage.put).toHaveBeenCalledTimes(1)
    expect(await db.select().from(schema.agentAssets)).toHaveLength(1)
    expect(await db.select().from(schema.storageObjects)).toHaveLength(1)
    expect(await db.select().from(schema.storageObjectClaims)).toHaveLength(1)
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 16, usedBytes: 16 }),
    ])
    const uploadBuckets = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "asset_upload"))
    expect(uploadBuckets).toEqual([{ count: 1 }, { count: 1 }])

    const changed = await app.handle(
      uploadRequest({
        file: pngFile("retry.png", { variant: 2 }),
        uploadId: "agent-upload-retry",
      })
    )
    expect(changed.status).toBe(409)
    expect(await changed.json()).toMatchObject({
      error: { code: "conflict" },
    })
    expect(storage.put).toHaveBeenCalledTimes(1)
  })

  it("revalidates live scope for a ready finalize retry and never cleans a concurrently finalized asset", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "finalize-fence" })
    )
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
    const [asset] = await db
      .select()
      .from(schema.agentAssets)
      .where(eq(schema.agentAssets.id, assetId))
    const [object] = await db
      .select()
      .from(schema.storageObjects)
      .where(eq(schema.storageObjects.id, asset?.storageObjectId ?? "missing"))
    const [claim] = await db
      .select()
      .from(schema.storageObjectClaims)
      .where(
        eq(schema.storageObjectClaims.storageObjectId, object?.id ?? "missing")
      )
    if (!asset || !object || !claim || !object.etag) {
      throw new Error("Ready asset fixture is incomplete")
    }

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-b", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    await expect(
      finalizePendingAgentAsset(db, {
        assetId,
        etag: object.etag,
        imageHeight: object.imageHeight ?? -1,
        imageWidth: object.imageWidth ?? -1,
        organizationId: "asset-org-a",
      })
    ).rejects.toMatchObject({
      code: "active_organization_mismatch",
      statusCode: 409,
    })
    expect(
      await db
        .select({ status: schema.agentAssets.status })
        .from(schema.agentAssets)
        .where(eq(schema.agentAssets.id, assetId))
    ).toEqual([{ status: "ready" }])

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-a", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    const concurrentlyFinalized = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "concurrent-finalize" })
    )
    const concurrentlyFinalizedAssetId = v.parse(
      agentAssetDtoModel,
      await concurrentlyFinalized.json()
    ).id
    const [concurrentlyFinalizedAsset] = await db
      .select()
      .from(schema.agentAssets)
      .where(eq(schema.agentAssets.id, concurrentlyFinalizedAssetId))
    const [concurrentlyFinalizedObject] = await db
      .select()
      .from(schema.storageObjects)
      .where(
        eq(
          schema.storageObjects.id,
          concurrentlyFinalizedAsset?.storageObjectId ?? "missing"
        )
      )
    const [concurrentlyFinalizedClaim] = await db
      .select()
      .from(schema.storageObjectClaims)
      .where(
        eq(
          schema.storageObjectClaims.storageObjectId,
          concurrentlyFinalizedObject?.id ?? "missing"
        )
      )
    if (
      !concurrentlyFinalizedAsset ||
      !concurrentlyFinalizedObject ||
      !concurrentlyFinalizedClaim
    ) {
      throw new Error("Concurrent finalize fixture is incomplete")
    }
    const stalePendingSnapshot: AgentAssetWithStorage = {
      asset: { ...concurrentlyFinalizedAsset, status: "pending" },
      storage: {
        ...concurrentlyFinalizedObject,
        etag: null,
        imageHeight: null,
        imageWidth: null,
        status: "pending",
      },
      claim: concurrentlyFinalizedClaim,
    }
    storage.setInfo({ format: "png", height: 360, width: 641 })
    await expect(
      reconcilePendingAgentAsset(db, {
        runtime: storage.runtime,
        value: stalePendingSnapshot,
      })
    ).rejects.toMatchObject({ code: "conflict", statusCode: 409 })

    expect(
      await db
        .select({ status: schema.agentAssets.status })
        .from(schema.agentAssets)
        .where(eq(schema.agentAssets.id, concurrentlyFinalizedAssetId))
    ).toEqual([{ status: "ready" }])
    expect(
      await db
        .select({ status: schema.storageObjects.status })
        .from(schema.storageObjects)
        .where(eq(schema.storageObjects.id, concurrentlyFinalizedObject.id))
    ).toEqual([{ status: "ready" }])
    expect(await db.select().from(schema.storageObjectClaims)).toHaveLength(2)
    expect(await db.select().from(schema.storageObjectCleanupJobs)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 32, usedBytes: 32 }),
    ])
  })

  it("enforces the organization ready cap again inside finalization", async () => {
    const { db } = await createFixture()
    await seedReadyAssetBatch(db, {
      count: AGENT_ASSET_MAX_READY_PER_ORGANIZATION - 1,
      prefix: "ready-cap",
    })
    const now = new Date()
    const reserve = (suffix: string) => {
      const assetId = `cap-pending-${suffix}`
      const storageObjectId = `cap-storage-${suffix}`
      return reservePendingAgentAsset(db, {
        assetId,
        declaredContentType: "image/png",
        detectedImageFormat: "png",
        filename: `${suffix}.png`,
        objectKey: agentAssetObjectKey({
          organizationId: "asset-org-a",
          storageObjectId,
        }),
        organizationId: "asset-org-a",
        sessionId: "asset-session-a",
        sizeBytes: 16,
        storageObjectId,
        threadId: "asset-thread-a",
        uploadId: `cap-upload-${suffix}`,
        uploaderId: "asset-user-a",
        now,
      })
    }
    const first = await reserve("first")
    const second = await reserve("second")

    await finalizePendingAgentAsset(db, {
      assetId: first.value.asset.id,
      etag: "cap-etag-first",
      imageHeight: 1,
      imageWidth: 1,
      organizationId: "asset-org-a",
      now,
    })
    await expect(
      finalizePendingAgentAsset(db, {
        assetId: second.value.asset.id,
        etag: "cap-etag-second",
        imageHeight: 1,
        imageWidth: 1,
        organizationId: "asset-org-a",
        now,
      })
    ).rejects.toMatchObject({
      code: "rate_limited",
      publicContext: { constraint: "ready_per_organization" },
      statusCode: 429,
    })

    expect(
      await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.agentAssets)
        .where(eq(schema.agentAssets.status, "ready"))
    ).toEqual([{ count: AGENT_ASSET_MAX_READY_PER_ORGANIZATION }])
    expect(
      await db
        .select({ status: schema.agentAssets.status })
        .from(schema.agentAssets)
        .where(eq(schema.agentAssets.id, second.value.asset.id))
    ).toEqual([{ status: "pending" }])
    expect(
      await db
        .select({ status: schema.storageObjects.status })
        .from(schema.storageObjects)
        .where(eq(schema.storageObjects.id, second.value.storage.id))
    ).toEqual([{ status: "pending" }])
  })

  it("rejects MIME, signature, unsupported, oversize, and quota violations before R2", async () => {
    const { db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    const invalid = [
      pngFile("mismatch.jpg", { type: "image/jpeg" }),
      new File(["not-an-image"], "fake.png", { type: "image/png" }),
      new File(
        [new Uint8Array([0, 0, 0, 24]), "ftyp", "avif"],
        "unsupported.avif",
        { type: "image/avif" }
      ),
      pngFile("too-large.png", { size: AGENT_ASSET_MAX_BYTES + 1 }),
    ]
    for (const [index, file] of invalid.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- each rejected case must leave the same DB/R2 baseline.
      await expect(
        uploadDirect(db, file, `invalid-${index}`)
      ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })
    }
    expect(storage.put).not.toHaveBeenCalled()
    expect(await db.select().from(schema.storageObjects)).toEqual([])
    expect(await db.select().from(schema.agentAssets)).toEqual([])

    const quotaFile = pngFile("quota.png")
    await db.insert(schema.organizationFileUsage).values({
      organizationId: "asset-org-a",
      usedBytes: ORGANIZATION_FILE_QUOTA_BYTES - quotaFile.size + 1,
      temporaryBytes: 0,
      updatedAt: new Date(),
    })
    await expect(
      uploadDirect(db, quotaFile, "quota-rejected")
    ).rejects.toMatchObject({ code: "rate_limited", statusCode: 429 })
    expect(storage.put).not.toHaveBeenCalled()
    expect(await db.select().from(schema.storageObjects)).toEqual([])
    const [usage] = await db.select().from(schema.organizationFileUsage)
    expect(usage?.usedBytes).toBe(
      ORGANIZATION_FILE_QUOTA_BYTES - quotaFile.size + 1
    )
  })

  it("atomically rate-limits a new upload without consuming storage quota", async () => {
    const { db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const now = new Date()
    const window = utcUsageWindow(now, AGENT_USAGE_HOUR_MS)
    await db.transaction(async (tx) => {
      for (
        let index = 0;
        index < AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT;
        index += 1
      ) {
        // oxlint-disable-next-line no-await-in-loop -- one bucket must deterministically reach its exact limit.
        await consumeAgentResourceLimitInTransaction(tx, {
          kind: "asset_upload",
          limitCount: AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT,
          now,
          operationId: `seed-upload-${index}`,
          organizationId: "asset-org-a",
          userId: "asset-user-a",
          ...window,
        })
      }
    })

    await expect(
      uploadDirect(db, pngFile(), "rate-limited-upload")
    ).rejects.toMatchObject({ code: "rate_limited", statusCode: 429 })
    expect(storage.put).not.toHaveBeenCalled()
    expect(await db.select().from(schema.storageObjects)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([])
    expect(
      await db
        .select({ count: schema.agentResourceUsageBuckets.count })
        .from(schema.agentResourceUsageBuckets)
    ).toEqual([{ count: AGENT_ASSET_UPLOAD_USER_HOURLY_LIMIT }])
  })

  it("purges expired usage buckets and operation ledgers from the scheduled lifecycle after grace", async () => {
    const { db } = await createFixture()
    const storage = createRuntime()
    const scheduledNow = new Date("2026-07-22T12:00:00.000Z")
    const expiredWindow = utcUsageWindow(
      new Date(
        scheduledNow.getTime() -
          AGENT_RESOURCE_USAGE_RETENTION_GRACE_MS -
          2 * AGENT_USAGE_DAY_MS
      ),
      AGENT_USAGE_DAY_MS
    )
    const retainedWindow = utcUsageWindow(
      new Date(scheduledNow.getTime() - 12 * AGENT_USAGE_HOUR_MS),
      AGENT_USAGE_DAY_MS
    )
    await db.transaction(async (tx) => {
      await consumeAgentResourceLimitInTransaction(tx, {
        kind: "asset_upload",
        limitCount: 10,
        now: expiredWindow.windowStart,
        operationId: "expired-operation",
        organizationId: "asset-org-a",
        userId: "asset-user-a",
        ...expiredWindow,
      })
      await consumeAgentResourceLimitInTransaction(tx, {
        kind: "asset_upload",
        limitCount: 10,
        now: retainedWindow.windowStart,
        operationId: "retained-operation",
        organizationId: "asset-org-a",
        userId: "asset-user-a",
        ...retainedWindow,
      })
    })

    const result = await processAgentAssetLifecycle({
      bucket: storage.bucket,
      database: db,
      now: scheduledNow,
    })

    expect(result.usagePurge).toEqual({
      bucketsDeleted: 1,
      operationsDeleted: 1,
    })
    expect(
      await db
        .select({ windowStart: schema.agentResourceUsageBuckets.windowStart })
        .from(schema.agentResourceUsageBuckets)
    ).toEqual([{ windowStart: retainedWindow.windowStart }])
    expect(
      await db
        .select({
          operationId: schema.agentResourceUsageOperations.operationId,
        })
        .from(schema.agentResourceUsageOperations)
    ).toEqual([{ operationId: "retained-operation" }])
  })

  it("rejects Images signature/dimension metadata after PUT and durably queues exact cleanup", async () => {
    const { db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    storage.setInfo({ format: "jpeg" })
    await expect(
      uploadDirect(db, pngFile("format.png"), "images-format-mismatch")
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })

    storage.setInfo({ format: "png", width: AGENT_ASSET_MAX_DIMENSION + 1 })
    await expect(
      uploadDirect(db, pngFile("dimensions.png"), "images-dimensions")
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })

    expect(storage.put).toHaveBeenCalledTimes(2)
    const assets = await db.select().from(schema.agentAssets)
    const objects = await db.select().from(schema.storageObjects)
    const jobs = await db.select().from(schema.storageObjectCleanupJobs)
    expect(assets).toHaveLength(2)
    expect(assets.every(({ status }) => status === "expired")).toBe(true)
    expect(
      assets.every(({ storageObjectId }) => storageObjectId === null)
    ).toBe(true)
    expect(objects.every(({ status }) => status === "deleting")).toBe(true)
    expect(jobs).toHaveLength(2)
    expect(
      jobs.every(({ objectKey, storageObjectId }) =>
        objectKey.endsWith(`/storage-objects/${storageObjectId}`)
      )
    ).toBe(true)
    expect(await db.select().from(schema.storageObjectClaims)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 0, usedBytes: 0 }),
    ])
  })

  it("hides other-owner/tenant assets and fails closed after organization or epoch changes", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)

    const otherOwnerUpload = await app.handle(
      uploadRequest({
        file: pngFile(),
        threadId: "asset-thread-other-owner",
        uploadId: "other-owner-thread",
      })
    )
    expect(otherOwnerUpload.status).toBe(404)
    const otherTenantUpload = await app.handle(
      uploadRequest({
        activeOrganizationId: "asset-org-b",
        file: pngFile(),
        organizationId: "asset-org-b",
        sessionId: "asset-session-b",
        threadId: "asset-thread-b",
        uploadId: "other-tenant-thread",
        userId: "asset-user-b",
      })
    )
    expect(otherTenantUpload.status).toBe(404)

    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "private-asset" })
    )
    expect(uploaded.status).toBe(201)
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id

    const otherOwnerRead = await app.handle(
      assetRequest({
        assetId,
        sessionId: "asset-session-b",
        userId: "asset-user-b",
      })
    )
    const otherTenantRead = await app.handle(
      assetRequest({
        activeOrganizationId: "asset-org-b",
        assetId,
        organizationId: "asset-org-b",
        sessionId: "asset-session-a-org-b",
      })
    )
    expect(otherOwnerRead.status).toBe(404)
    expect(otherTenantRead.status).toBe(404)

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-b", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    const switched = await app.handle(assetRequest({ assetId }))
    expect(switched.status).toBe(409)
    expect(await switched.json()).toMatchObject({
      error: { code: "active_organization_mismatch" },
    })

    await db
      .update(schema.session)
      .set({ activeOrganizationId: "asset-org-a", updatedAt: new Date() })
      .where(eq(schema.session.id, "asset-session-a"))
    const epochInvalidated = await app.handle(assetRequest({ assetId }))
    expect(epochInvalidated.status).toBe(401)
    expect(storage.images.input).not.toHaveBeenCalled()
  })

  it("binds only the selected run assets and fences model image output at WebP 4 MiB", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "model-asset" })
    )
    expect(uploaded.status).toBe(201)
    const uploadedAssetId = v.parse(
      agentAssetDtoModel,
      await uploaded.json()
    ).id
    const connection = await openConnection(db)
    const internal = createAgentInternalApi(db)
    const run = await internal.startRun({
      grant: connection.grant,
      clientMessageId: "model-image-run",
      assetIds: [uploadedAssetId],
    })
    const bindings = await db
      .select()
      .from(schema.agentRunAssets)
      .where(eq(schema.agentRunAssets.runId, run.runId))
    expect(bindings).toEqual([
      expect.objectContaining({
        assetId: uploadedAssetId,
        sizeBytes: 16,
      }),
    ])

    const modelImage = await internal.getAgentImageForModel({
      grant: run.grant,
      assetId: uploadedAssetId,
    })
    expect(modelImage.status).toBe(200)
    expect(modelImage.headers.get("content-type")).toBe("image/webp")
    expect(modelImage.headers.get("cache-control")).toBe("private, no-store")
    expect(modelImage.headers.get("content-length")).toBe("6")
    expect(new Uint8Array(await modelImage.arrayBuffer())).toEqual(
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x57, 0x45])
    )
    expect(storage.images.transform).toHaveBeenLastCalledWith({
      fit: "scale-down",
      width: 2048,
    })
    expect(storage.images.output).toHaveBeenLastCalledWith({
      anim: false,
      format: "image/webp",
      quality: 75,
    })

    storage.setOutput({
      bytes: new Uint8Array(AGENT_ASSET_MODEL_MAX_BYTES + 1),
      contentLength: null,
    })
    await expect(
      internal.getAgentImageForModel({
        grant: run.grant,
        assetId: uploadedAssetId,
      })
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })

    storage.setOutput({
      bytes: new Uint8Array([1]),
      contentType: "image/png",
    })
    await expect(
      internal.getAgentImageForModel({
        grant: run.grant,
        assetId: uploadedAssetId,
      })
    ).rejects.toMatchObject({ code: "service_unavailable", statusCode: 503 })
    const visionBuckets = await db
      .select({ count: schema.agentResourceUsageBuckets.count })
      .from(schema.agentResourceUsageBuckets)
      .where(eq(schema.agentResourceUsageBuckets.kind, "vision_transform"))
    expect(visionBuckets).toEqual([{ count: 1 }, { count: 1 }])
    await internal.finishRun({ grant: run.grant, outcome: "completed" })

    const seededIds: string[] = []
    for (let index = 0; index < 5; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- libSQL has one writer; fixture order is intentional.
      const seededId = await seedReadyAsset(db, {
        id: `count-asset-${index}`,
        sizeBytes: 1,
      })
      seededIds.push(seededId)
    }
    const countConnection = await openConnection(db)
    await expect(
      startAgentRun(db, {
        grant: countConnection.grant,
        clientMessageId: "too-many-assets",
        assetIds: seededIds,
      })
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })

    const largeIds: string[] = []
    for (let index = 0; index < 3; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- libSQL has one writer; fixture order is intentional.
      const seededId = await seedReadyAsset(db, {
        id: `large-asset-${index}`,
        sizeBytes: 7_000_000,
      })
      largeIds.push(seededId)
    }
    const byteConnection = await openConnection(db)
    await expect(
      startAgentRun(db, {
        grant: byteConnection.grant,
        clientMessageId: "too-many-bytes",
        assetIds: largeIds,
      })
    ).rejects.toMatchObject({ code: "validation_error", statusCode: 400 })
    const failedRuns = await db
      .select()
      .from(schema.agentRuns)
      .where(
        sql`${schema.agentRuns.clientMessageId} in ('too-many-assets', 'too-many-bytes')`
      )
    expect(failedRuns).toEqual([])
  })

  it("records a minimal file.uploaded audit inside zero-copy promotion", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const assetId = await seedReadyAsset(db, {
      id: "promotion-audit-asset",
      sizeBytes: 16,
    })
    const [object] = await db
      .select()
      .from(schema.storageObjects)
      .where(eq(schema.storageObjects.id, `storage-${assetId}`))
    if (!object?.etag || !object.objectKey) {
      throw new Error("Promotion storage fixture is incomplete")
    }
    storage.objects.set(object.objectKey, {
      bytes: Uint8Array.from(pngBytes()),
      object: {
        key: object.objectKey,
        size: object.sizeBytes,
        etag: object.etag,
        httpEtag: `"${object.etag}"`,
        customMetadata: {},
      },
    })
    await db.insert(schema.organizationFileUsage).values({
      organizationId: "asset-org-a",
      usedBytes: object.sizeBytes,
      temporaryBytes: object.sizeBytes,
      updatedAt: new Date(),
    })
    const connection = await openConnection(db)
    const run = await createAgentInternalApi(db).startRun({
      grant: connection.grant,
      clientMessageId: "promotion-audit-run",
      assetIds: [assetId],
    })
    const now = new Date()
    const actionId = "promotion-audit-action"
    const issueId = "promotion-audit-issue"
    const plannedFileId = "promotion-audit-file"
    const leaseExpiresAt = new Date(now.getTime() + 5 * 60_000)
    await db.insert(schema.agentActions).values({
      id: actionId,
      organizationId: "asset-org-a",
      threadId: "asset-thread-a",
      runId: run.runId,
      sessionId: "asset-session-a",
      userId: "asset-user-a",
      contextEpoch: 1,
      toolCallId: "promotion-audit-tool",
      kind: "create_issue",
      normalizedPayload: { title: "Issue from image" },
      canonicalPreview: { title: "Issue from image" },
      targetType: "issue",
      targetId: issueId,
      status: "pending",
      idempotencyKey: "promotion-audit-idempotency",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })
    await db.insert(schema.agentActionAssets).values({
      organizationId: "asset-org-a",
      actionId,
      assetId,
      storageObjectId: object.id,
      sourceEtag: object.etag,
      sizeBytes: object.sizeBytes,
      leaseExpiresAt,
      createdAt: now,
    })
    const decidedAt = new Date(now.getTime() + 1)
    await db
      .update(schema.agentActions)
      .set({
        status: "approved",
        decisionProvenance: "manual",
        decisionIdempotencyKey: "promotion-audit-decision",
        decidedAt,
        updatedAt: decidedAt,
      })
      .where(eq(schema.agentActions.id, actionId))
    await db.insert(schema.issues).values({
      id: issueId,
      organizationId: "asset-org-a",
      number: 1,
      title: "Issue from image",
      description: "Generated description",
      status: "open",
      priority: "no_priority",
      creatorId: "asset-user-a",
      labels: ["Visual"],
      dueDate: null,
      createdAt: decidedAt,
      updatedAt: decidedAt,
    })

    await db.transaction((tx) =>
      promoteAgentAssetToIssueFileInTransaction(tx, {
        actionId,
        actorUserId: "asset-user-a",
        assetId,
        issueId,
        now: new Date(decidedAt.getTime() + 1),
        organizationId: "asset-org-a",
        plannedFileId,
      })
    )

    expect(
      await db
        .select({
          action: schema.auditLogs.action,
          actorUserId: schema.auditLogs.actorUserId,
          metadata: schema.auditLogs.metadata,
          organizationId: schema.auditLogs.organizationId,
          targetId: schema.auditLogs.targetId,
          targetType: schema.auditLogs.targetType,
        })
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "file.uploaded"))
    ).toEqual([
      {
        action: "file.uploaded",
        actorUserId: "asset-user-a",
        metadata: {},
        organizationId: "asset-org-a",
        targetId: plannedFileId,
        targetType: "file",
      },
    ])
    expect(
      await db
        .select({
          objectKey: schema.files.objectKey,
          storageObjectId: schema.files.storageObjectId,
        })
        .from(schema.files)
        .where(eq(schema.files.id, plannedFileId))
    ).toEqual([{ objectKey: object.objectKey, storageObjectId: object.id }])

    const promotedPreview = await app.handle(assetRequest({ assetId }))
    expect(promotedPreview.status).toBe(200)
    expect(promotedPreview.headers.get("content-type")).toBe("image/webp")

    const unauthorizedPreview = await app.handle(
      assetRequest({
        assetId,
        sessionId: "asset-session-b",
        userId: "asset-user-b",
      })
    )
    expect(unauthorizedPreview.status).toBe(404)
  })

  it("blocks deletion under an active action lease, then releases quota and exact-deletes", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "leased-asset" })
    )
    expect(uploaded.status).toBe(201)
    const assetId = v.parse(agentAssetDtoModel, await uploaded.json()).id
    const [object] = await db.select().from(schema.storageObjects)
    expect(object?.objectKey).toBeTruthy()

    const connection = await openConnection(db)
    const run = await createAgentInternalApi(db).startRun({
      grant: connection.grant,
      clientMessageId: "lease-run",
      assetIds: [assetId],
    })
    const actionCreatedAt = new Date()
    const actionExpiresAt = new Date(actionCreatedAt.getTime() + 10 * 60_000)
    await db.insert(schema.agentActions).values({
      id: "leased-action",
      organizationId: "asset-org-a",
      threadId: "asset-thread-a",
      runId: run.runId,
      sessionId: "asset-session-a",
      userId: "asset-user-a",
      contextEpoch: 1,
      toolCallId: "leased-tool-call",
      kind: "create_issue",
      normalizedPayload: { title: "Issue with attachment" },
      canonicalPreview: { title: "Issue with attachment" },
      targetType: "issue",
      targetId: "planned-leased-issue",
      status: "pending",
      idempotencyKey: "leased-action-key",
      createdAt: actionCreatedAt,
      updatedAt: actionCreatedAt,
      expiresAt: actionExpiresAt,
    })
    await db.insert(schema.agentActionAssets).values({
      organizationId: "asset-org-a",
      actionId: "leased-action",
      assetId,
      storageObjectId: object?.id,
      sourceEtag: object?.etag ?? "",
      sizeBytes: object?.sizeBytes ?? -1,
      leaseExpiresAt: new Date(actionCreatedAt.getTime() + 5 * 60_000),
      createdAt: actionCreatedAt,
    })

    const blocked = await app.handle(
      assetRequest({ assetId, method: "DELETE" })
    )
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toMatchObject({ error: { code: "conflict" } })
    expect(await db.select().from(schema.storageObjectCleanupJobs)).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 16, usedBytes: 16 }),
    ])

    const completedAt = new Date()
    await db
      .update(schema.agentActions)
      .set({
        status: "canceled",
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(schema.agentActions.id, "leased-action"))
    const removed = await app.handle(
      assetRequest({ assetId, method: "DELETE" })
    )
    expect(removed.status).toBe(204)
    expect(storage.deletedKeys).toEqual([])
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 0, usedBytes: 0 }),
    ])
    expect(await db.select().from(schema.storageObjectClaims)).toEqual([])
    expect(await db.select().from(schema.agentAssets)).toEqual([
      expect.objectContaining({ status: "deleted", storageObjectId: null }),
    ])

    const cleanup = await processStorageObjectCleanupJobs({
      bucket: storage.bucket,
      database: db,
      now: new Date(completedAt.getTime() + 1_000),
    })
    expect(cleanup).toMatchObject({ claimed: 1, completed: 1, failed: 0 })
    expect(storage.deletedKeys).toEqual([object?.objectKey])
    expect(await db.select().from(schema.storageObjects)).toEqual([
      expect.objectContaining({ objectKey: null, status: "deleted" }),
    ])
    expect(await db.select().from(schema.storageObjectCleanupJobs)).toEqual([
      expect.objectContaining({ status: "completed" }),
    ])
  })

  it("expires chat-only assets and never deletes R2 when the exact-key fence is tampered", async () => {
    const { app, db } = await createFixture()
    const storage = createRuntime()
    configureFileStorageRuntime(storage.runtime)
    const uploaded = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "expiring-asset" })
    )
    expect(uploaded.status).toBe(201)
    v.parse(agentAssetDtoModel, await uploaded.json())
    const [asset] = await db.select().from(schema.agentAssets)
    const expiry = asset?.expiresAt ?? new Date(0)

    const result = await processAgentAssetLifecycle({
      bucket: storage.bucket,
      database: db,
      now: new Date(expiry.getTime() + 1),
    })
    expect(result).toMatchObject({
      expiry: { considered: 1, expired: 1 },
      cleanup: { claimed: 1, completed: 1, failed: 0 },
    })
    expect(storage.deletedKeys).toHaveLength(1)
    expect(await db.select().from(schema.organizationFileUsage)).toEqual([
      expect.objectContaining({ temporaryBytes: 0, usedBytes: 0 }),
    ])

    const second = await app.handle(
      uploadRequest({ file: pngFile(), uploadId: "tampered-cleanup" })
    )
    expect(second.status).toBe(201)
    const secondId = v.parse(agentAssetDtoModel, await second.json()).id
    expect(
      (await app.handle(assetRequest({ assetId: secondId, method: "DELETE" })))
        .status
    ).toBe(204)
    const [pendingJob] = await db
      .select()
      .from(schema.storageObjectCleanupJobs)
      .where(eq(schema.storageObjectCleanupJobs.status, "pending"))
    expect(pendingJob).toBeTruthy()
    await expect(
      db
        .update(schema.storageObjectCleanupJobs)
        .set({ objectKey: `${pendingJob?.objectKey}-tampered` })
        .where(eq(schema.storageObjectCleanupJobs.id, pendingJob?.id ?? ""))
    ).rejects.toBeDefined()
    expect(
      await db
        .select({ objectKey: schema.storageObjectCleanupJobs.objectKey })
        .from(schema.storageObjectCleanupJobs)
        .where(eq(schema.storageObjectCleanupJobs.id, pendingJob?.id ?? ""))
    ).toEqual([{ objectKey: pendingJob?.objectKey }])
    await db
      .update(schema.storageObjects)
      .set({ objectKey: null, status: "deleted", updatedAt: new Date() })
      .where(
        eq(schema.storageObjects.id, pendingJob?.storageObjectId ?? "missing")
      )
    const deletesBefore = storage.deletedKeys.length
    const failures: Array<{ attempts: number; errorCode: string }> = []
    const cleanup = await processStorageObjectCleanupJobs({
      bucket: storage.bucket,
      database: db,
      now: new Date(),
      onFailure: (failure) => failures.push(failure),
    })
    expect(cleanup).toMatchObject({ claimed: 1, completed: 0, failed: 1 })
    expect(storage.deletedKeys).toHaveLength(deletesBefore)
    expect(failures).toEqual([
      { attempts: 1, errorCode: "cleanup_fence_mismatch" },
    ])
    expect(
      await db
        .select({ error: schema.storageObjectCleanupJobs.lastErrorCode })
        .from(schema.storageObjectCleanupJobs)
        .where(eq(schema.storageObjectCleanupJobs.id, pendingJob?.id ?? ""))
    ).toEqual([{ error: "cleanup_fence_mismatch" }])
  })
})
