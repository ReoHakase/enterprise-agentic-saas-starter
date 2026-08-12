import {
  mcpCreateAttachmentUploadSessionToolOutputSchema,
  type McpCreateAttachmentUploadSessionToolInput,
  type McpCreateAttachmentUploadSessionToolOutput,
} from "@enterprise-agentic-saas/agent-contracts"
import type { Db } from "@enterprise-agentic-saas/db"
import {
  mcpAttachmentUploads,
  organizationFileUsage,
  storageObjects,
} from "@enterprise-agentic-saas/db/schema"
import { lte, sql } from "drizzle-orm"

import { HttpError } from "../../errors/http-error"
import type { McpPrincipal } from "../principal"
import { runIdempotently } from "./idempotency"
import { expireMcpAttachmentUploads } from "./upload-application"

const MCP_UPLOAD_LIFETIME_MS = 15 * 60 * 1000
const MCP_UPLOAD_MAX_PENDING_PER_USER = 8
const MCP_UPLOAD_MAX_PENDING_PER_ORGANIZATION = 32
const ORGANIZATION_FILE_QUOTA_BYTES = 1024 * 1024 * 1024

export const createMcpAttachmentUploadSession = async (
  db: Db,
  principal: McpPrincipal,
  input: McpCreateAttachmentUploadSessionToolInput
): Promise<McpCreateAttachmentUploadSessionToolOutput> => {
  await expireMcpAttachmentUploads({
    db,
    organizationId: principal.organizationId,
  })
  const payload = {
    declaredContentType: input.declaredContentType.trim().toLowerCase(),
    filename: input.filename.trim(),
    sizeBytes: input.sizeBytes,
  }
  if (!payload.filename || !payload.declaredContentType) {
    throw new HttpError({ code: "validation_error" })
  }
  return runIdempotently({
    db,
    principal,
    idempotencyKey: input.idempotencyKey,
    payload,
    schema: mcpCreateAttachmentUploadSessionToolOutputSchema,
    toolName: "create_attachment_upload_session",
    mutate: async (tx) => {
      const now = new Date()
      const counts = await tx.all<{
        organizationCount: number | string
        userCount: number | string
      }>(sql`
        select count(*) as organizationCount,
               sum(case when ${mcpAttachmentUploads.userId} = ${principal.userId} then 1 else 0 end) as userCount
        from ${mcpAttachmentUploads}
        where ${mcpAttachmentUploads.organizationId} = ${principal.organizationId}
          and ${mcpAttachmentUploads.status} = 'pending'
          and ${mcpAttachmentUploads.expiresAt} > ${now}
      `)
      if (
        Number(counts[0]?.userCount ?? 0) >= MCP_UPLOAD_MAX_PENDING_PER_USER ||
        Number(counts[0]?.organizationCount ?? 0) >=
          MCP_UPLOAD_MAX_PENDING_PER_ORGANIZATION
      ) {
        throw new HttpError({ code: "rate_limited" })
      }
      const usage = await tx
        .insert(organizationFileUsage)
        .values({
          organizationId: principal.organizationId,
          usedBytes: payload.sizeBytes,
          temporaryBytes: payload.sizeBytes,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: organizationFileUsage.organizationId,
          set: {
            usedBytes: sql`${organizationFileUsage.usedBytes} + ${payload.sizeBytes}`,
            temporaryBytes: sql`${organizationFileUsage.temporaryBytes} + ${payload.sizeBytes}`,
            updatedAt: now,
          },
          setWhere: lte(
            organizationFileUsage.usedBytes,
            ORGANIZATION_FILE_QUOTA_BYTES - payload.sizeBytes
          ),
        })
        .returning({ usedBytes: organizationFileUsage.usedBytes })
      if (!usage[0]) throw new HttpError({ code: "conflict" })

      const uploadId = crypto.randomUUID()
      const storageObjectId = crypto.randomUUID()
      const objectKey = [
        "organizations",
        encodeURIComponent(principal.organizationId),
        "storage-objects",
        encodeURIComponent(storageObjectId),
      ].join("/")
      const expiresAt = new Date(now.getTime() + MCP_UPLOAD_LIFETIME_MS)
      await tx.insert(storageObjects).values({
        id: storageObjectId,
        organizationId: principal.organizationId,
        uploaderId: principal.userId,
        uploadId: `mcp:${uploadId}`,
        objectKey,
        sizeBytes: payload.sizeBytes,
        declaredContentType: payload.declaredContentType,
        detectedImageFormat: null,
        status: "pending",
        keyVersion: 2,
        createdAt: now,
        updatedAt: now,
      })
      await tx.insert(mcpAttachmentUploads).values({
        id: uploadId,
        organizationId: principal.organizationId,
        userId: principal.userId,
        clientId: principal.clientId,
        storageObjectId,
        filename: payload.filename,
        status: "pending",
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      return {
        expiresAt: expiresAt.toISOString(),
        replayed: false,
        uploadId,
        uploadUrl: new URL(
          `/mcp/uploads/${uploadId}`,
          principal.audience
        ).toString(),
      }
    },
  })
}
