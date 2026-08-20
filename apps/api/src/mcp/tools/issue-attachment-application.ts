import type { Db } from "@enterprise-agentic-saas/db"
import {
  auditLogs,
  files,
  issueFileOwners,
  mcpAttachmentUploads,
  organizationFileUsage,
  storageObjectClaims,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import {
  deleteReadyFilesInTransaction,
  getFileOwnerAdapter,
  type FileWithOwner,
} from "../../modules/files/public"
import { updateIssueInTransaction } from "../../modules/issues/public"
import {
  mcpIssueWriteReceiptSchema,
  type McpAddIssueAttachmentsToolInput,
  type McpIssueWriteReceipt,
  type McpRemoveIssueAttachmentsToolInput,
} from "../contracts"
import type { McpPrincipal } from "../principal"
import { runIdempotently } from "./idempotency"
import {
  issueReceipt,
  requireIssueRevision,
  type McpTransaction,
} from "./write-support"

const requireReadyMcpUpload = async (
  tx: McpTransaction,
  input: { assetId: string; now: Date; principal: McpPrincipal }
) => {
  const rows = await tx
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
        eq(mcpAttachmentUploads.id, input.assetId),
        eq(mcpAttachmentUploads.organizationId, input.principal.organizationId),
        eq(mcpAttachmentUploads.userId, input.principal.userId),
        eq(mcpAttachmentUploads.clientId, input.principal.clientId),
        eq(mcpAttachmentUploads.status, "ready"),
        sql`${mcpAttachmentUploads.expiresAt} > ${input.now}`,
        eq(storageObjects.status, "ready")
      )
    )
    .limit(1)
  const row = rows[0]
  if (!row?.storage.objectKey || !row.storage.etag) {
    throw new HttpError({ code: "not_found" })
  }
  return {
    ...row,
    storage: {
      ...row.storage,
      objectKey: row.storage.objectKey,
      etag: row.storage.etag,
    },
  }
}

const promoteMcpUpload = async (
  tx: McpTransaction,
  input: {
    assetId: string
    issueId: string
    now: Date
    operationId: string
    principal: McpPrincipal
  }
) => {
  const row = await requireReadyMcpUpload(tx, input)
  const fileId = crypto.randomUUID()
  await tx.insert(files).values({
    id: fileId,
    organizationId: input.principal.organizationId,
    uploaderId: input.principal.userId,
    uploadId: `mcp:${input.operationId}:${input.assetId}`,
    ownerType: "issue",
    objectKey: row.storage.objectKey,
    filename: row.upload.filename,
    sizeBytes: row.storage.sizeBytes,
    declaredContentType: row.storage.declaredContentType,
    detectedImageFormat: row.storage.detectedImageFormat,
    imageWidth: row.storage.imageWidth,
    imageHeight: row.storage.imageHeight,
    etag: row.storage.etag,
    status: "pending",
    storageObjectId: row.storage.id,
    keyVersion: row.storage.keyVersion,
    createdAt: input.now,
    updatedAt: input.now,
  })
  await tx.insert(issueFileOwners).values({
    fileId,
    organizationId: input.principal.organizationId,
    ownerType: "issue",
    issueId: input.issueId,
  })
  await tx.insert(storageObjectClaims).values({
    storageObjectId: row.storage.id,
    organizationId: input.principal.organizationId,
    holderType: "file",
    holderId: fileId,
    revision: 1,
    createdAt: input.now,
    updatedAt: input.now,
  })
  const ready = await tx
    .update(files)
    .set({ status: "ready", updatedAt: input.now })
    .where(
      and(
        eq(files.id, fileId),
        eq(files.organizationId, input.principal.organizationId),
        eq(files.status, "pending")
      )
    )
    .returning({ id: files.id })
  if (!ready[0]) throw new Error("MCP attachment promotion lost its file")
  const consumed = await tx
    .update(mcpAttachmentUploads)
    .set({
      status: "consumed",
      consumedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(mcpAttachmentUploads.id, input.assetId),
        eq(mcpAttachmentUploads.organizationId, input.principal.organizationId),
        eq(mcpAttachmentUploads.status, "ready")
      )
    )
    .returning({ id: mcpAttachmentUploads.id })
  if (!consumed[0]) throw new HttpError({ code: "conflict" })
  const usage = await tx
    .update(organizationFileUsage)
    .set({
      temporaryBytes: sql`${organizationFileUsage.temporaryBytes} - ${row.storage.sizeBytes}`,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(
          organizationFileUsage.organizationId,
          input.principal.organizationId
        ),
        sql`${organizationFileUsage.temporaryBytes} >= ${row.storage.sizeBytes}`
      )
    )
    .returning({ organizationId: organizationFileUsage.organizationId })
  if (!usage[0]) throw new Error("MCP temporary storage usage is inconsistent")
  await tx.insert(auditLogs).values({
    id: crypto.randomUUID(),
    organizationId: input.principal.organizationId,
    actorUserId: input.principal.userId,
    action: "file.uploaded",
    targetType: "file",
    targetId: fileId,
    metadata: { source: "mcp", operationId: input.operationId },
    createdAt: input.now,
  })
  await getFileOwnerAdapter("issue").recordActivity(tx, {
    actorUserId: input.principal.userId,
    fileId,
    filename: row.upload.filename,
    kind: "file_added",
    occurredAt: input.now,
    organizationId: input.principal.organizationId,
    ownerId: input.issueId,
  })
  return fileId
}

export const promoteMcpUploads = (
  tx: McpTransaction,
  input: {
    assetIds: readonly string[]
    issueId: string
    now: Date
    operationId: string
    principal: McpPrincipal
  }
) =>
  input.assetIds.reduce<Promise<string[]>>(async (pending, assetId) => {
    const fileIds = await pending
    const fileId = await promoteMcpUpload(tx, { ...input, assetId })
    return [...fileIds, fileId]
  }, Promise.resolve([]))

const orderedFiles = (
  rows: Array<{ ownerId: string; stored: Omit<FileWithOwner, "ownerId"> }>,
  fileIds: readonly string[]
) => {
  const byId = new Map(rows.map((row) => [row.stored.id, row]))
  return fileIds.map((fileId) => {
    const row = byId.get(fileId)
    if (!row) throw new HttpError({ code: "not_found" })
    return Object.assign({}, row.stored, { ownerId: row.ownerId })
  })
}

export const createMcpAttachmentWriteApplication = (
  db: Db,
  principal: McpPrincipal
) => ({
  addIssueAttachments: async (
    input: McpAddIssueAttachmentsToolInput
  ): Promise<McpIssueWriteReceipt> => {
    const payload = {
      issueId: input.issueId.trim(),
      expectedRevision: input.expectedRevision,
      assetIds: [...new Set(input.assetIds.map((assetId) => assetId.trim()))],
    }
    return runIdempotently({
      db,
      principal,
      idempotencyKey: input.idempotencyKey,
      payload,
      schema: mcpIssueWriteReceiptSchema,
      toolName: "add_issue_attachments",
      mutate: async (tx, operationId) => {
        const now = new Date()
        await requireIssueRevision(tx, {
          expectedRevision: payload.expectedRevision,
          issueId: payload.issueId,
          organizationId: principal.organizationId,
        })
        const updated = await updateIssueInTransaction(tx, {
          id: payload.issueId,
          actorUserId: principal.userId,
          organizationId: principal.organizationId,
          expectedRevision: payload.expectedRevision,
          now,
          auditContext: { source: "mcp", actionId: operationId },
        })
        if (!updated) throw new HttpError({ code: "conflict" })
        const fileIds = await promoteMcpUploads(tx, {
          assetIds: payload.assetIds,
          issueId: updated.id,
          now,
          operationId,
          principal,
        })
        return issueReceipt({
          operationId,
          id: updated.id,
          number: updated.number,
          revision: updated.revision,
          deleted: false,
          attachmentMutation: { operation: "added", fileIds },
        })
      },
    })
  },

  removeIssueAttachments: async (
    input: McpRemoveIssueAttachmentsToolInput
  ): Promise<McpIssueWriteReceipt> => {
    const payload = {
      issueId: input.issueId.trim(),
      expectedRevision: input.expectedRevision,
      fileIds: [...new Set(input.fileIds.map((fileId) => fileId.trim()))],
    }
    return runIdempotently({
      db,
      principal,
      idempotencyKey: input.idempotencyKey,
      payload,
      schema: mcpIssueWriteReceiptSchema,
      toolName: "remove_issue_attachments",
      mutate: async (tx, operationId) => {
        await requireIssueRevision(tx, {
          expectedRevision: payload.expectedRevision,
          issueId: payload.issueId,
          organizationId: principal.organizationId,
        })
        const rows = await tx
          .select({ stored: files, ownerId: issueFileOwners.issueId })
          .from(files)
          .innerJoin(
            issueFileOwners,
            and(
              eq(issueFileOwners.organizationId, files.organizationId),
              eq(issueFileOwners.fileId, files.id),
              eq(issueFileOwners.ownerType, "issue"),
              eq(issueFileOwners.issueId, payload.issueId)
            )
          )
          .where(
            and(
              eq(files.organizationId, principal.organizationId),
              eq(files.status, "ready"),
              inArray(files.id, payload.fileIds)
            )
          )
        if (rows.length !== payload.fileIds.length) {
          throw new HttpError({ code: "not_found" })
        }
        const filesToDelete = orderedFiles(rows, payload.fileIds)
        const now = new Date()
        const updated = await updateIssueInTransaction(tx, {
          id: payload.issueId,
          actorUserId: principal.userId,
          organizationId: principal.organizationId,
          expectedRevision: payload.expectedRevision,
          now,
          auditContext: { source: "mcp", actionId: operationId },
        })
        if (!updated) throw new HttpError({ code: "conflict" })
        const deleted = await deleteReadyFilesInTransaction(tx, {
          actorUserId: principal.userId,
          files: filesToDelete,
          now,
        })
        if (!deleted) throw new HttpError({ code: "conflict" })
        return issueReceipt({
          operationId,
          id: updated.id,
          number: updated.number,
          revision: updated.revision,
          deleted: false,
          attachmentMutation: {
            operation: "removed",
            fileIds: payload.fileIds,
          },
        })
      },
    })
  },
})
