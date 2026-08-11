import type { Db } from "@enterprise-agentic-saas/db"
import {
  mcpAttachmentUploads,
  organizationFileUsage,
  storageObjectCleanupJobs,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import { detectImageFormat } from "../../modules/files/file-domain"
import {
  bodyObject,
  getFileStorageRuntime,
  streamsEqual,
  type FileR2Object,
} from "../../modules/files/public"
import type { McpPrincipal } from "../principal"

const metadataMatches = (
  object: FileR2Object,
  input: {
    objectKey: string
    sizeBytes: number
    storageObjectId: string
    uploadId: string
  }
) => {
  const metadata = object.customMetadata
  if (!metadata) return false
  const keys = Object.keys(metadata).toSorted()
  return (
    keys.length === 3 &&
    keys[0] === "expectedSize" &&
    keys[1] === "storageObjectId" &&
    keys[2] === "uploadId" &&
    object.key === input.objectKey &&
    object.size === input.sizeBytes &&
    metadata.expectedSize === String(input.sizeBytes) &&
    metadata.storageObjectId === input.storageObjectId &&
    metadata.uploadId === input.uploadId
  )
}

const contentLength = (request: Request) => {
  const raw = request.headers.get("content-length")
  if (!raw || !/^\d+$/.test(raw)) {
    throw new HttpError({ code: "validation_error" })
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new HttpError({ code: "validation_error" })
  }
  return value
}

export const expireMcpAttachmentUploads = async (input: {
  db: Db
  organizationId: string
  now?: Date
}) => {
  const now = input.now ?? new Date()
  return input.db.transaction(async (tx) => {
    const rows = await tx
      .select({ upload: mcpAttachmentUploads, storage: storageObjects })
      .from(mcpAttachmentUploads)
      .innerJoin(
        storageObjects,
        and(
          eq(
            storageObjects.organizationId,
            mcpAttachmentUploads.organizationId
          ),
          eq(storageObjects.id, mcpAttachmentUploads.storageObjectId)
        )
      )
      .where(
        and(
          eq(mcpAttachmentUploads.organizationId, input.organizationId),
          inArray(mcpAttachmentUploads.status, ["pending", "ready"]),
          lte(mcpAttachmentUploads.expiresAt, now),
          inArray(storageObjects.status, ["pending", "ready"])
        )
      )
      .limit(32)
    return rows.reduce<Promise<number>>(async (pending, row) => {
      const expired = await pending
      const uploads = await tx
        .update(mcpAttachmentUploads)
        .set({ status: "expired", updatedAt: now })
        .where(
          and(
            eq(mcpAttachmentUploads.id, row.upload.id),
            eq(mcpAttachmentUploads.organizationId, input.organizationId),
            eq(mcpAttachmentUploads.status, row.upload.status),
            lte(mcpAttachmentUploads.expiresAt, now)
          )
        )
        .returning({ id: mcpAttachmentUploads.id })
      if (!uploads[0]) return expired
      const usage = await tx
        .update(organizationFileUsage)
        .set({
          usedBytes: sql`${organizationFileUsage.usedBytes} - ${row.storage.sizeBytes}`,
          temporaryBytes: sql`${organizationFileUsage.temporaryBytes} - ${row.storage.sizeBytes}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(organizationFileUsage.organizationId, input.organizationId),
            sql`${organizationFileUsage.usedBytes} >= ${row.storage.sizeBytes}`,
            sql`${organizationFileUsage.temporaryBytes} >= ${row.storage.sizeBytes}`
          )
        )
        .returning({ organizationId: organizationFileUsage.organizationId })
      if (!usage[0]) throw new Error("MCP upload quota release is inconsistent")
      const storage = await tx
        .update(storageObjects)
        .set({
          cleanupRevision: sql`${storageObjects.cleanupRevision} + 1`,
          status: "deleting",
          updatedAt: now,
        })
        .where(
          and(
            eq(storageObjects.id, row.storage.id),
            eq(storageObjects.organizationId, input.organizationId),
            eq(storageObjects.status, row.storage.status),
            eq(storageObjects.cleanupRevision, row.storage.cleanupRevision)
          )
        )
        .returning({
          cleanupRevision: storageObjects.cleanupRevision,
          objectKey: storageObjects.objectKey,
        })
      const released = storage[0]
      if (!released?.objectKey)
        throw new Error("MCP upload cleanup lost its fence")
      await tx.insert(storageObjectCleanupJobs).values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        storageObjectId: row.storage.id,
        expectedCleanupRevision: released.cleanupRevision,
        objectKey: released.objectKey,
        status: "pending",
        createdAt: now,
      })
      return expired + 1
    }, Promise.resolve(0))
  })
}

export const uploadMcpAttachment = async (input: {
  db: Db
  principal: McpPrincipal
  request: Request
  uploadId: string
}) => {
  if (input.request.method !== "PUT") {
    return new Response(null, { status: 405, headers: { allow: "PUT" } })
  }
  if (!input.principal.scopes.has("files:write")) {
    throw new HttpError({ code: "forbidden" })
  }
  const rows = await input.db
    .select({ upload: mcpAttachmentUploads, storage: storageObjects })
    .from(mcpAttachmentUploads)
    .innerJoin(
      storageObjects,
      and(
        eq(storageObjects.organizationId, mcpAttachmentUploads.organizationId),
        eq(storageObjects.id, mcpAttachmentUploads.storageObjectId)
      )
    )
    .where(
      and(
        eq(mcpAttachmentUploads.id, input.uploadId),
        eq(mcpAttachmentUploads.organizationId, input.principal.organizationId),
        eq(mcpAttachmentUploads.userId, input.principal.userId),
        eq(mcpAttachmentUploads.clientId, input.principal.clientId),
        eq(mcpAttachmentUploads.status, "pending"),
        gt(mcpAttachmentUploads.expiresAt, new Date()),
        eq(storageObjects.status, "pending")
      )
    )
    .limit(1)
  const row = rows[0]
  if (!row?.storage.objectKey) throw new HttpError({ code: "not_found" })
  if (
    contentLength(input.request) !== row.storage.sizeBytes ||
    input.request.headers.get("content-type")?.trim().toLowerCase() !==
      row.storage.declaredContentType
  ) {
    throw new HttpError({ code: "validation_error" })
  }
  const blob = await input.request.blob()
  if (blob.size !== row.storage.sizeBytes) {
    throw new HttpError({ code: "validation_error" })
  }
  const file = new File([blob], row.upload.filename, {
    type: row.storage.declaredContentType,
  })
  const detectedImageFormat = await detectImageFormat(file)
  const runtime = getFileStorageRuntime()
  let object: FileR2Object | null
  let wroteObject = false
  try {
    object = await runtime.bucket.head(row.storage.objectKey)
    if (!object) {
      object = await runtime.bucket.put(row.storage.objectKey, file.stream(), {
        onlyIf: new Headers({ "if-none-match": "*" }),
        httpMetadata: { contentType: "application/octet-stream" },
        customMetadata: {
          expectedSize: String(row.storage.sizeBytes),
          storageObjectId: row.storage.id,
          uploadId: row.upload.id,
        },
      })
      wroteObject = object !== null
      object ??= await runtime.bucket.head(row.storage.objectKey)
    } else {
      const source = bodyObject(await runtime.bucket.get(row.storage.objectKey))
      if (!source || !(await streamsEqual(file.stream(), source.body))) {
        throw new HttpError({ code: "conflict" })
      }
    }
  } catch (cause) {
    if (cause instanceof HttpError) throw cause
    throw new HttpError({ code: "service_unavailable", cause, retryAfter: 5 })
  }
  if (
    !object ||
    !metadataMatches(object, {
      objectKey: row.storage.objectKey,
      sizeBytes: row.storage.sizeBytes,
      storageObjectId: row.storage.id,
      uploadId: row.upload.id,
    }) ||
    typeof object.etag !== "string" ||
    object.etag.length < 1 ||
    object.etag.length > 128
  ) {
    throw new HttpError({ code: "service_unavailable", retryAfter: 5 })
  }

  if (!wroteObject) {
    try {
      const source = bodyObject(await runtime.bucket.get(row.storage.objectKey))
      if (!source) {
        throw new HttpError({ code: "service_unavailable", retryAfter: 5 })
      }
      if (!(await streamsEqual(file.stream(), source.body))) {
        throw new HttpError({ code: "conflict" })
      }
    } catch (cause) {
      if (cause instanceof HttpError) throw cause
      throw new HttpError({ code: "service_unavailable", cause, retryAfter: 5 })
    }
  }

  await input.db.transaction(async (tx) => {
    const storage = await tx
      .update(storageObjects)
      .set({
        detectedImageFormat,
        etag: object.etag,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storageObjects.id, row.storage.id),
          eq(storageObjects.organizationId, input.principal.organizationId),
          eq(storageObjects.status, "pending")
        )
      )
      .returning({ id: storageObjects.id })
    if (!storage[0]) throw new HttpError({ code: "conflict" })
    const upload = await tx
      .update(mcpAttachmentUploads)
      .set({ status: "ready", updatedAt: new Date() })
      .where(
        and(
          eq(mcpAttachmentUploads.id, row.upload.id),
          eq(
            mcpAttachmentUploads.organizationId,
            input.principal.organizationId
          ),
          eq(mcpAttachmentUploads.status, "pending"),
          gt(mcpAttachmentUploads.expiresAt, new Date())
        )
      )
      .returning({ id: mcpAttachmentUploads.id })
    if (!upload[0]) throw new HttpError({ code: "conflict" })
  })
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  })
}
